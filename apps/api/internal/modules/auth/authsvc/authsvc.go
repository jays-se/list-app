// Package authsvc implements sign-in (OIDC code flow + PKCE), server-side
// sessions and sign-out (ADR-0008, ADR-0017).
//
// Sessions are looked up per request straight from PostgreSQL. The
// ops/query channel cache pattern (backend-go rule §2) is not used yet; add
// it via ADR if session lookups show up in latency budgets.
package authsvc

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/intellicars/list-app/apps/api/internal/db"
	"github.com/intellicars/list-app/apps/api/internal/modules/auth/authmdl"
)

// Login failure kinds, surfaced as /login?error=<kind> (reference behaviour).
const (
	FailState    = "state"
	FailDenied   = "denied"
	FailOAuth    = "oauth"
	FailInternal = "internal"
)

const flowTTL = 10 * time.Minute

var ErrNoSession = errors.New("authsvc: no valid session")

type AuthSvc struct {
	pool     *pgxpool.Pool
	provider IdentityProvider
	secret   []byte
	ttl      time.Duration
	now      func() time.Time
	log      *slog.Logger
}

func NewAuthSvc(pool *pgxpool.Pool, provider IdentityProvider, secret []byte, ttl time.Duration, now func() time.Time, log *slog.Logger) *AuthSvc {
	return &AuthSvc{pool: pool, provider: provider, secret: secret, ttl: ttl, now: now, log: log}
}

func (s *AuthSvc) Provider() IdentityProvider { return s.provider }
func (s *AuthSvc) SessionTTL() time.Duration  { return s.ttl }

type flowState struct {
	State    string `json:"s"`
	Nonce    string `json:"n"`
	Verifier string `json:"v"`
	ReturnTo string `json:"r"`
}

// SafeReturnTo keeps post-login redirects on this site.
func SafeReturnTo(p string) string {
	if !strings.HasPrefix(p, "/") || strings.HasPrefix(p, "//") || strings.HasPrefix(p, "/\\") ||
		strings.HasPrefix(p, "/api/") || strings.ContainsAny(p, "\r\n") {
		return "/"
	}
	return p
}

// BeginLogin returns the provider URL and the signed flow cookie value.
func (s *AuthSvc) BeginLogin(returnTo string) (redirectURL, flowCookie string, err error) {
	flow := flowState{
		State:    randomToken(24),
		Nonce:    randomToken(24),
		Verifier: randomToken(48),
		ReturnTo: SafeReturnTo(returnTo),
	}
	cookie, err := sign(s.secret, flow, flowTTL, s.now())
	if err != nil {
		return "", "", fmt.Errorf("authsvc: sign flow: %w", err)
	}
	redirectURL = s.provider.AuthCodeURL(flow.State, flow.Nonce, flow.Verifier)
	if redirectURL == "" {
		return "", "", fmt.Errorf("%w: provider unavailable", ErrExchange)
	}
	return redirectURL, cookie, nil
}

// CallbackParams are the query parameters of the OAuth callback.
type CallbackParams struct {
	Code, State, Error string
}

// LoginResult is a completed sign-in; Token goes into the sid cookie.
type LoginResult struct {
	Token    string
	ReturnTo string
}

// CompleteLogin validates the callback against the flow cookie, exchanges
// the code, upserts the user and opens a session. On failure it returns one
// of the Fail* kinds.
func (s *AuthSvc) CompleteLogin(ctx context.Context, p CallbackParams, flowCookie string) (LoginResult, string) {
	flow, err := verify[flowState](s.secret, flowCookie, s.now())
	if err != nil || p.State == "" || p.State != flow.State {
		return LoginResult{}, FailState
	}
	if p.Error != "" {
		if p.Error == "access_denied" {
			return LoginResult{}, FailDenied
		}
		return LoginResult{}, FailOAuth
	}
	identity, err := s.provider.Exchange(ctx, p.Code, flow.Verifier, flow.Nonce)
	if err != nil {
		s.log.Warn("login_exchange_failed", "provider", s.provider.Name(), "error", err)
		return LoginResult{}, FailOAuth
	}
	user, err := s.upsertUser(ctx, identity)
	if err != nil {
		s.log.Error("login_upsert_failed", "error", err)
		return LoginResult{}, FailInternal
	}
	token, err := s.createSession(ctx, user.ID)
	if err != nil {
		s.log.Error("login_session_failed", "error", err)
		return LoginResult{}, FailInternal
	}
	s.log.Info("login_succeeded", "user_id", user.ID, "provider", identity.Provider)
	return LoginResult{Token: token, ReturnTo: flow.ReturnTo}, ""
}

func (s *AuthSvc) upsertUser(ctx context.Context, id authmdl.Identity) (authmdl.User, error) {
	var u authmdl.User
	err := s.pool.QueryRow(ctx, `
		INSERT INTO users (email, name, image_url, auth_provider, auth_subject)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (auth_provider, auth_subject)
		DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name,
		              image_url = EXCLUDED.image_url, updated_at = now()
		RETURNING id, email, name, image_url, auth_provider, auth_subject`,
		id.Email, id.Name, id.Image, id.Provider, id.Subject,
	).Scan(&u.ID, &u.Email, &u.Name, &u.ImageURL, &u.AuthProvider, &u.AuthSubject)
	if err != nil {
		return authmdl.User{}, fmt.Errorf("authsvc: upsert user: %w", err)
	}
	return u, nil
}

// createSession opens a session, re-activating the workspace the user last
// used (falling back to their oldest membership).
func (s *AuthSvc) createSession(ctx context.Context, userID string) (string, error) {
	var active *string
	err := db.WithUser(ctx, s.pool, userID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
			SELECT coalesce(
			  (SELECT s.active_workspace_id FROM sessions s
			    JOIN memberships m ON m.workspace_id = s.active_workspace_id AND m.user_id = s.user_id
			   WHERE s.user_id = $1 AND s.active_workspace_id IS NOT NULL
			   ORDER BY s.created_at DESC LIMIT 1),
			  (SELECT workspace_id FROM memberships WHERE user_id = $1 ORDER BY joined_at LIMIT 1))`,
			userID).Scan(&active)
	})
	if err != nil {
		return "", fmt.Errorf("authsvc: pick active workspace: %w", err)
	}
	token := randomToken(32)
	_, err = s.pool.Exec(ctx, `
		INSERT INTO sessions (id_hash, user_id, active_workspace_id, expires_at)
		VALUES ($1, $2, $3, $4)`,
		HashToken(token), userID, active, s.now().Add(s.ttl))
	if err != nil {
		return "", fmt.Errorf("authsvc: insert session: %w", err)
	}
	return token, nil
}

// Authenticate resolves a session token to its session and user.
func (s *AuthSvc) Authenticate(ctx context.Context, token string) (authmdl.Session, authmdl.User, error) {
	if token == "" {
		return authmdl.Session{}, authmdl.User{}, ErrNoSession
	}
	sess := authmdl.Session{IDHash: HashToken(token)}
	var u authmdl.User
	err := s.pool.QueryRow(ctx, `
		SELECT s.user_id, s.active_workspace_id, s.expires_at,
		       u.id, u.email, u.name, u.image_url, u.auth_provider, u.auth_subject
		  FROM sessions s JOIN users u ON u.id = s.user_id
		 WHERE s.id_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > $2`,
		sess.IDHash, s.now(),
	).Scan(&sess.UserID, &sess.ActiveWorkspaceID, &sess.ExpiresAt,
		&u.ID, &u.Email, &u.Name, &u.ImageURL, &u.AuthProvider, &u.AuthSubject)
	if errors.Is(err, pgx.ErrNoRows) {
		return authmdl.Session{}, authmdl.User{}, ErrNoSession
	}
	if err != nil {
		return authmdl.Session{}, authmdl.User{}, fmt.Errorf("authsvc: authenticate: %w", err)
	}
	return sess, u, nil
}

// SetActiveWorkspace records the session's active workspace (nil clears it).
// Callers must have verified membership.
func (s *AuthSvc) SetActiveWorkspace(ctx context.Context, sessionHash []byte, workspaceID *string) error {
	_, err := s.pool.Exec(ctx, `UPDATE sessions SET active_workspace_id = $2 WHERE id_hash = $1`, sessionHash, workspaceID)
	if err != nil {
		return fmt.Errorf("authsvc: set active workspace: %w", err)
	}
	return nil
}

// Logout revokes the session. Unknown tokens are ignored (idempotent).
func (s *AuthSvc) Logout(ctx context.Context, token string) error {
	if token == "" {
		return nil
	}
	_, err := s.pool.Exec(ctx, `UPDATE sessions SET revoked_at = $2 WHERE id_hash = $1 AND revoked_at IS NULL`, HashToken(token), s.now())
	if err != nil {
		return fmt.Errorf("authsvc: logout: %w", err)
	}
	return nil
}
