package authsvc

import (
	"context"
	"fmt"
	"net/mail"
	"net/url"
	"strings"
	"time"

	"github.com/intellicars/list-app/apps/api/internal/modules/auth/authmdl"
)

// DevProvider is a built-in identity provider for dev/test (never prod, ADR-0017).
// Its "authorize" page is served by authhdlr; codes are HMAC-signed and live
// for one minute.
type DevProvider struct {
	secret []byte
	now    func() time.Time
}

func NewDevProvider(secret []byte, now func() time.Time) *DevProvider {
	return &DevProvider{secret: secret, now: now}
}

const DevAuthorizePath = "/api/v1/auth/dev/authorize"

func (d *DevProvider) Name() string { return "dev" }

func (d *DevProvider) AuthCodeURL(state, nonce, _ string) string {
	return DevAuthorizePath + "?" + url.Values{"state": {state}, "nonce": {nonce}}.Encode()
}

type devCode struct {
	Email string `json:"email"`
	Name  string `json:"name"`
	Nonce string `json:"nonce"`
}

// IssueCode validates the dev form and returns a signed authorization code.
func (d *DevProvider) IssueCode(name, email, nonce string) (string, error) {
	name = strings.TrimSpace(name)
	addr, err := mail.ParseAddress(strings.TrimSpace(email))
	if err != nil || name == "" {
		return "", fmt.Errorf("authsvc: dev sign-in needs a name and a valid email")
	}
	return sign(d.secret, devCode{Email: strings.ToLower(addr.Address), Name: name, Nonce: nonce}, time.Minute, d.now())
}

func (d *DevProvider) Exchange(_ context.Context, code, _, nonce string) (authmdl.Identity, error) {
	c, err := verify[devCode](d.secret, code, d.now())
	if err != nil {
		return authmdl.Identity{}, fmt.Errorf("%w: %v", ErrExchange, err)
	}
	if c.Nonce != nonce {
		return authmdl.Identity{}, fmt.Errorf("%w: nonce mismatch", ErrExchange)
	}
	return authmdl.Identity{Provider: "dev", Subject: c.Email, Email: c.Email, Name: c.Name}, nil
}
