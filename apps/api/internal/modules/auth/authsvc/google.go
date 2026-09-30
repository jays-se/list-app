package authsvc

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"

	"github.com/intellicars/list-app/apps/api/internal/modules/auth/authmdl"
)

// GoogleProvider signs in with Google OIDC: authorization code + PKCE (S256),
// ID token verified by go-oidc (signature, iss, aud, exp) plus nonce and
// email_verified checks here (ADR-0017).
type GoogleProvider struct {
	issuer       string
	clientID     string
	clientSecret string
	redirectURL  string

	// Discovery is done once, lazily, so the API starts without network.
	init     sync.Once
	initErr  error
	oauth    oauth2.Config
	verifier *oidc.IDTokenVerifier
}

func NewGoogleProvider(issuer, clientID, clientSecret, redirectURL string) *GoogleProvider {
	return &GoogleProvider{issuer: issuer, clientID: clientID, clientSecret: clientSecret, redirectURL: redirectURL}
}

func (g *GoogleProvider) Name() string { return "google" }

func (g *GoogleProvider) discover(ctx context.Context) error {
	g.init.Do(func() {
		ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
		defer cancel()
		provider, err := oidc.NewProvider(ctx, g.issuer)
		if err != nil {
			g.initErr = fmt.Errorf("authsvc: oidc discovery: %w", err)
			return
		}
		g.oauth = oauth2.Config{
			ClientID:     g.clientID,
			ClientSecret: g.clientSecret,
			RedirectURL:  g.redirectURL,
			Endpoint:     provider.Endpoint(),
			Scopes:       []string{oidc.ScopeOpenID, "email", "profile"},
		}
		g.verifier = provider.Verifier(&oidc.Config{ClientID: g.clientID})
	})
	return g.initErr
}

// AuthCodeURL returns "" when discovery failed; the handler then redirects
// to /login?error=oauth.
func (g *GoogleProvider) AuthCodeURL(state, nonce, verifier string) string {
	if err := g.discover(context.Background()); err != nil {
		return ""
	}
	return g.oauth.AuthCodeURL(state, oauth2.S256ChallengeOption(verifier), oidc.Nonce(nonce))
}

func (g *GoogleProvider) Exchange(ctx context.Context, code, verifier, nonce string) (authmdl.Identity, error) {
	if err := g.discover(ctx); err != nil {
		return authmdl.Identity{}, fmt.Errorf("%w: %v", ErrExchange, err)
	}
	token, err := g.oauth.Exchange(ctx, code, oauth2.VerifierOption(verifier))
	if err != nil {
		return authmdl.Identity{}, fmt.Errorf("%w: code exchange: %v", ErrExchange, err)
	}
	raw, ok := token.Extra("id_token").(string)
	if !ok {
		return authmdl.Identity{}, fmt.Errorf("%w: no id_token", ErrExchange)
	}
	idToken, err := g.verifier.Verify(ctx, raw)
	if err != nil {
		return authmdl.Identity{}, fmt.Errorf("%w: verify: %v", ErrExchange, err)
	}
	if idToken.Nonce != nonce {
		return authmdl.Identity{}, fmt.Errorf("%w: nonce mismatch", ErrExchange)
	}
	var claims struct {
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
		Name          string `json:"name"`
		Picture       string `json:"picture"`
	}
	if err := idToken.Claims(&claims); err != nil {
		return authmdl.Identity{}, fmt.Errorf("%w: claims: %v", ErrExchange, err)
	}
	if claims.Email == "" || !claims.EmailVerified {
		return authmdl.Identity{}, fmt.Errorf("%w: email not verified", ErrExchange)
	}
	id := authmdl.Identity{Provider: "google", Subject: idToken.Subject, Email: claims.Email, Name: claims.Name}
	if id.Name == "" {
		id.Name = claims.Email
	}
	if claims.Picture != "" {
		id.Image = &claims.Picture
	}
	return id, nil
}
