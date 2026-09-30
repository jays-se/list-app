package authsvc

import (
	"context"
	"errors"

	"github.com/intellicars/list-app/apps/api/internal/modules/auth/authmdl"
)

// IdentityProvider is one sign-in method. The flow around it (state, nonce,
// PKCE, sessions, error redirects) is shared, so Google and the dev
// provider exercise the same code (ADR-0017).
type IdentityProvider interface {
	Name() string
	// AuthCodeURL is where the browser goes to authenticate.
	AuthCodeURL(state, nonce, verifier string) string
	// Exchange turns a callback code into a verified identity.
	Exchange(ctx context.Context, code, verifier, nonce string) (authmdl.Identity, error)
}

// ErrExchange means the provider rejected or could not verify the sign-in.
var ErrExchange = errors.New("authsvc: identity exchange failed")
