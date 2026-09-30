package authsvc

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	jose "github.com/go-jose/go-jose/v4"
	"github.com/go-jose/go-jose/v4/jwt"
)

// fakeIssuer is a minimal OIDC provider: discovery, JWKS and a token
// endpoint that checks PKCE and returns an RS256 ID token.
type fakeIssuer struct {
	srv       *httptest.Server
	key       *rsa.PrivateKey
	challenge string // code_challenge seen at /authorize (via test)
	claims    map[string]any
	aud       string
}

func newFakeIssuer(t *testing.T) *fakeIssuer {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	f := &fakeIssuer{key: key, aud: "client-1"}
	mux := http.NewServeMux()
	f.srv = httptest.NewServer(mux)
	t.Cleanup(f.srv.Close)

	mux.HandleFunc("/.well-known/openid-configuration", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"issuer":                                f.srv.URL,
			"authorization_endpoint":                f.srv.URL + "/authorize",
			"token_endpoint":                        f.srv.URL + "/token",
			"jwks_uri":                              f.srv.URL + "/jwks",
			"id_token_signing_alg_values_supported": []string{"RS256"},
		})
	})
	mux.HandleFunc("/jwks", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(jose.JSONWebKeySet{Keys: []jose.JSONWebKey{
			{Key: &key.PublicKey, KeyID: "k1", Algorithm: "RS256", Use: "sig"},
		}})
	})
	mux.HandleFunc("/token", func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		sum := sha256.Sum256([]byte(r.PostForm.Get("code_verifier")))
		if base64.RawURLEncoding.EncodeToString(sum[:]) != f.challenge || r.PostForm.Get("code") != "good-code" {
			http.Error(w, `{"error":"invalid_grant"}`, http.StatusBadRequest)
			return
		}
		signer, _ := jose.NewSigner(jose.SigningKey{Algorithm: jose.RS256, Key: key},
			(&jose.SignerOptions{}).WithType("JWT").WithHeader("kid", "k1"))
		claims := map[string]any{
			"iss": f.srv.URL, "aud": f.aud, "sub": "google-sub-1",
			"iat": time.Now().Unix(), "exp": time.Now().Add(time.Hour).Unix(),
		}
		for k, v := range f.claims {
			claims[k] = v
		}
		raw, _ := jwt.Signed(signer).Claims(claims).Serialize()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"access_token": "at", "token_type": "Bearer", "expires_in": 3600, "id_token": raw,
		})
	})
	return f
}

// authorize simulates the browser round-trip: records the PKCE challenge.
func (f *fakeIssuer) authorize(t *testing.T, authURL string) (state, nonce string) {
	t.Helper()
	u, err := url.Parse(authURL)
	if err != nil {
		t.Fatal(err)
	}
	q := u.Query()
	if q.Get("code_challenge_method") != "S256" || q.Get("client_id") != "client-1" {
		t.Fatalf("auth URL missing PKCE/client: %s", authURL)
	}
	f.challenge = q.Get("code_challenge")
	return q.Get("state"), q.Get("nonce")
}

func TestGoogleProviderExchange(t *testing.T) {
	cases := []struct {
		name    string
		claims  map[string]any
		aud     string
		code    string
		nonceOK bool
		wantErr bool
	}{
		{"valid", map[string]any{"email": "ada@example.com", "email_verified": true, "name": "Ada", "picture": "https://img/ada"}, "client-1", "good-code", true, false},
		{"unverified email", map[string]any{"email": "ada@example.com", "email_verified": false}, "client-1", "good-code", true, true},
		{"wrong nonce", map[string]any{"email": "ada@example.com", "email_verified": true}, "client-1", "good-code", false, true},
		{"wrong audience", map[string]any{"email": "ada@example.com", "email_verified": true}, "someone-else", "good-code", true, true},
		{"bad code", map[string]any{}, "client-1", "bad-code", true, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			f := newFakeIssuer(t)
			f.aud = c.aud
			g := NewGoogleProvider(f.srv.URL, "client-1", "secret", "http://app/callback")
			verifier := randomToken(48)
			state, nonce := f.authorize(t, g.AuthCodeURL("st", "n-123", verifier))
			if state != "st" || nonce != "n-123" {
				t.Fatalf("state/nonce not forwarded: %q %q", state, nonce)
			}
			idNonce := nonce
			if !c.nonceOK {
				idNonce = "other"
			}
			f.claims = map[string]any{"nonce": idNonce}
			for k, v := range c.claims {
				f.claims[k] = v
			}

			id, err := g.Exchange(context.Background(), c.code, verifier, nonce)
			if c.wantErr {
				if !errors.Is(err, ErrExchange) {
					t.Fatalf("want ErrExchange, got %v (%+v)", err, id)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if id.Provider != "google" || id.Subject != "google-sub-1" || id.Email != "ada@example.com" || id.Name != "Ada" || id.Image == nil {
				t.Fatalf("identity = %+v", id)
			}
		})
	}
}

func TestGoogleDiscoveryFailure(t *testing.T) {
	g := NewGoogleProvider("http://127.0.0.1:1", "id", "secret", "http://app/cb")
	if u := g.AuthCodeURL("s", "n", "v"); u != "" {
		t.Fatalf("expected empty URL on discovery failure, got %q", u)
	}
	if _, err := g.Exchange(context.Background(), "c", "v", "n"); !errors.Is(err, ErrExchange) {
		t.Fatalf("want ErrExchange, got %v", err)
	}
}

func TestSignedValues(t *testing.T) {
	secret := []byte("0123456789abcdef0123456789abcdef")
	now := time.Unix(1_800_000_000, 0)
	token, err := sign(secret, map[string]string{"a": "b"}, time.Minute, now)
	if err != nil {
		t.Fatal(err)
	}
	if v, err := verify[map[string]string](secret, token, now.Add(59*time.Second)); err != nil || v["a"] != "b" {
		t.Fatalf("verify: %v %v", v, err)
	}
	if _, err := verify[map[string]string](secret, token, now.Add(61*time.Second)); err == nil {
		t.Fatal("expired token accepted")
	}
	if _, err := verify[map[string]string]([]byte("another-secret-another-secret-xx"), token, now); err == nil {
		t.Fatal("wrong secret accepted")
	}
	if _, err := verify[map[string]string](secret, token[:len(token)-2]+"AA", now); err == nil {
		t.Fatal("tampered tag accepted")
	}
}

func TestSafeReturnTo(t *testing.T) {
	cases := map[string]string{
		"/tasks?task=1": "/tasks?task=1", "": "/", "https://evil.example": "/", "//evil.example": "/",
		"/\\evil.example": "/", "/api/v1/auth/me": "/", "/ok\r\nSet-Cookie: x": "/",
	}
	for in, want := range cases {
		if got := SafeReturnTo(in); got != want {
			t.Errorf("SafeReturnTo(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestDevProvider(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	clock := func() time.Time { return now }
	d := NewDevProvider([]byte("0123456789abcdef0123456789abcdef"), clock)
	if _, err := d.IssueCode("", "a@b.co", "n"); err == nil {
		t.Fatal("empty name accepted")
	}
	if _, err := d.IssueCode("Ada", "nope", "n"); err == nil {
		t.Fatal("bad email accepted")
	}
	code, err := d.IssueCode(" Ada ", " Ada@Example.com ", "n1")
	if err != nil {
		t.Fatal(err)
	}
	id, err := d.Exchange(context.Background(), code, "", "n1")
	if err != nil || id.Email != "ada@example.com" || id.Name != "Ada" || id.Subject != "ada@example.com" {
		t.Fatalf("exchange: %+v %v", id, err)
	}
	if _, err := d.Exchange(context.Background(), code, "", "other"); !errors.Is(err, ErrExchange) {
		t.Fatal("nonce mismatch accepted")
	}
	now = now.Add(2 * time.Minute)
	if _, err := d.Exchange(context.Background(), code, "", "n1"); !errors.Is(err, ErrExchange) {
		t.Fatal("expired code accepted")
	}
}
