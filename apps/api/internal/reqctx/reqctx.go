// Package reqctx carries the authenticated principal and tenant through a
// request's context. It has no dependencies so every module can use it.
package reqctx

import "context"

// User is the signed-in person.
type User struct {
	ID    string
	Name  string
	Email string
	Image *string
}

// Session is the current browser session (the token hash, never the token).
type Session struct {
	IDHash            []byte
	ActiveWorkspaceID *string
}

// Tenant is the active workspace the request acts in, with the caller's role.
type Tenant struct {
	WorkspaceID string
	UserID      string
	Role        string
}

type (
	userKey    struct{}
	sessionKey struct{}
	tenantKey  struct{}
)

func WithAuth(ctx context.Context, u User, s Session) context.Context {
	ctx = context.WithValue(ctx, userKey{}, u)
	return context.WithValue(ctx, sessionKey{}, s)
}

func WithTenant(ctx context.Context, t Tenant) context.Context {
	return context.WithValue(ctx, tenantKey{}, t)
}

// UserFrom returns the signed-in user; ok is false on public routes.
func UserFrom(ctx context.Context) (User, bool) {
	u, ok := ctx.Value(userKey{}).(User)
	return u, ok
}

func SessionFrom(ctx context.Context) (Session, bool) {
	s, ok := ctx.Value(sessionKey{}).(Session)
	return s, ok
}

func TenantFrom(ctx context.Context) (Tenant, bool) {
	t, ok := ctx.Value(tenantKey{}).(Tenant)
	return t, ok
}
