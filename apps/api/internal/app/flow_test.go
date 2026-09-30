package app_test

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"os"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/intellicars/list-app/apps/api/internal/app"
	"github.com/intellicars/list-app/apps/api/internal/config"
	"github.com/intellicars/list-app/apps/api/internal/testdb"
)

// client is one browser: its own cookie jar, no automatic redirects.
type client struct {
	t    *testing.T
	base string
	http *http.Client
}

func newServer(t *testing.T) string {
	t.Helper()
	base, _ := newServerApp(t)
	return base
}

// newServerApp also returns the App so tests can drive background work
// (outbox dispatch, DUE reminders) deterministically.
func newServerApp(t *testing.T) (string, *app.App) {
	t.Helper()
	pool := testdb.Pool(t)
	srv := httptest.NewUnstartedServer(nil)
	cfg, err := config.Load(func(k string) string {
		return map[string]string{"APP_ENV": "test", "PUBLIC_BASE_URL": "http://" + srv.Listener.Addr().String(), "BLOB_DIR": t.TempDir()}[k]
	})
	if err != nil {
		t.Fatal(err)
	}
	var out io.Writer = io.Discard
	if os.Getenv("TEST_LOG") != "" { // TEST_LOG=1 shows server logs
		out = os.Stderr
	}
	a, err := app.Build(cfg, app.Options{Pool: pool, Log: slog.New(slog.NewTextHandler(out, nil)), StartedAt: time.Now()})
	if err != nil {
		t.Fatal(err)
	}
	srv.Config.Handler = a.Handler
	srv.Start()
	t.Cleanup(srv.Close)
	return srv.URL, a
}

func newClient(t *testing.T, base string) *client {
	jar, _ := cookiejar.New(nil)
	return &client{t: t, base: base, http: &http.Client{
		Jar:           jar,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}}
}

func (c *client) do(method, path string, body any, csrf bool) (*http.Response, []byte) {
	c.t.Helper()
	return c.doWith(method, path, body, csrf, nil)
}

func (c *client) doWith(method, path string, body any, csrf bool, headers map[string]string) (*http.Response, []byte) {
	c.t.Helper()
	var reader io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		reader = strings.NewReader(string(b))
	}
	req, _ := http.NewRequest(method, c.base+path, reader)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if csrf {
		req.Header.Set("X-Requested-With", "app")
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	res, err := c.http.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	return res, raw
}

func (c *client) postForm(path string, form url.Values) *http.Response {
	c.t.Helper()
	res, err := c.http.PostForm(c.base+path, form)
	if err != nil {
		c.t.Fatal(err)
	}
	res.Body.Close()
	return res
}

func expect(t *testing.T, res *http.Response, body []byte, status int) {
	t.Helper()
	if res.StatusCode != status {
		t.Fatalf("%s %s = %d, want %d: %s", res.Request.Method, res.Request.URL.Path, res.StatusCode, status, body)
	}
}

func decodeInto[T any](t *testing.T, raw []byte) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatalf("decode %s: %v", raw, err)
	}
	return v
}

var hiddenInput = regexp.MustCompile(`name="(state|nonce)" value="([^"]+)"`)

// signIn runs the full dev-provider flow and returns the final redirect.
func (c *client) signIn(name, email, returnTo string) string {
	c.t.Helper()
	res, _ := c.do("GET", "/api/v1/auth/google/login?returnTo="+url.QueryEscape(returnTo), nil, false)
	if res.StatusCode != 302 {
		c.t.Fatalf("login start = %d", res.StatusCode)
	}
	res, page := c.do("GET", res.Header.Get("Location"), nil, false)
	expect(c.t, res, page, 200)
	fields := url.Values{"name": {name}, "email": {email}}
	for _, m := range hiddenInput.FindAllStringSubmatch(string(page), -1) {
		fields.Set(m[1], m[2])
	}
	res = c.postForm("/api/v1/auth/dev/authorize", fields)
	if res.StatusCode != 302 {
		c.t.Fatalf("dev authorize = %d", res.StatusCode)
	}
	res, body := c.do("GET", res.Header.Get("Location"), nil, false)
	if res.StatusCode != 302 {
		c.t.Fatalf("callback = %d %s", res.StatusCode, body)
	}
	return res.Header.Get("Location")
}

type workspaceList struct {
	Workspaces []struct{ ID, Name, Role string } `json:"workspaces"`
	Active     *struct {
		ID, Name, Role string
		InviteCode     string `json:"inviteCode"`
	} `json:"active"`
}

type problem struct {
	Type, Title, Detail string
	Status              int
	Errors              []struct{ Field, Message string }
}

func TestSignInAndWorkspaceLifecycle(t *testing.T) {
	base := newServer(t)
	alice := newClient(t, base)

	res, body := alice.do("GET", "/api/v1/auth/me", nil, false)
	expect(t, res, body, 401)
	if p := decodeInto[problem](t, body); p.Type != "unauthenticated" || p.Detail != "sign in required" {
		t.Fatalf("401 shape: %+v", p)
	}

	if loc := alice.signIn("Alice", "Alice@Example.com", "/tasks?x=1"); loc != "/tasks?x=1" {
		t.Fatalf("returnTo = %q", loc)
	}
	res, body = alice.do("GET", "/api/v1/auth/me", nil, false)
	expect(t, res, body, 200)
	me := decodeInto[struct {
		User struct{ ID, Name, Email string }
	}](t, body)
	if me.User.Name != "Alice" || me.User.Email != "alice@example.com" {
		t.Fatalf("me = %+v", me)
	}

	// No workspace yet: empty list, workspace-scoped routes answer 409.
	res, body = alice.do("GET", "/api/v1/workspaces", nil, false)
	expect(t, res, body, 200)
	if l := decodeInto[workspaceList](t, body); len(l.Workspaces) != 0 || l.Active != nil {
		t.Fatalf("expected no workspaces: %s", body)
	}
	res, body = alice.do("GET", "/api/v1/workspaces/current/members", nil, false)
	expect(t, res, body, 409)

	// CSRF header required; validation → 422 with field errors.
	res, body = alice.do("POST", "/api/v1/workspaces", map[string]string{"name": "Acme"}, false)
	expect(t, res, body, 403)
	res, body = alice.do("POST", "/api/v1/workspaces", map[string]string{"name": "   "}, true)
	expect(t, res, body, 422)
	if p := decodeInto[problem](t, body); len(p.Errors) != 1 || p.Errors[0].Field != "name" {
		t.Fatalf("validation problem: %+v", p)
	}
	res, body = alice.do("POST", "/api/v1/workspaces", map[string]string{"name": strings.Repeat("x", 101)}, true)
	expect(t, res, body, 422)

	res, body = alice.do("POST", "/api/v1/workspaces", map[string]string{"name": "  Acme  "}, true)
	expect(t, res, body, 201)
	res, body = alice.do("GET", "/api/v1/workspaces", nil, false)
	acme := decodeInto[workspaceList](t, body)
	if acme.Active == nil || acme.Active.Name != "Acme" || acme.Active.Role != "OWNER" || len(acme.Active.InviteCode) != 26 {
		t.Fatalf("active after create: %s", body)
	}
	code := acme.Active.InviteCode

	// Bob joins with the invite code (idempotently).
	bob := newClient(t, base)
	bob.signIn("Bob", "bob@example.com", "/")
	res, body = bob.do("POST", "/api/v1/workspaces/join", map[string]string{"inviteCode": "nope"}, true)
	expect(t, res, body, 404)
	if p := decodeInto[problem](t, body); p.Detail != "That invite code isn't valid." {
		t.Fatalf("invite 404 detail = %q", p.Detail)
	}
	for range 2 {
		res, body = bob.do("POST", "/api/v1/workspaces/join", map[string]string{"inviteCode": strings.ToUpper(code)}, true)
		expect(t, res, body, 200)
	}
	res, body = bob.do("GET", "/api/v1/workspaces/current/members", nil, false)
	expect(t, res, body, 200)
	members := decodeInto[struct {
		Members []struct{ Name, Role string }
	}](t, body)
	if len(members.Members) != 2 || members.Members[0].Name != "Alice" || members.Members[0].Role != "OWNER" || members.Members[1].Role != "MEMBER" {
		t.Fatalf("members: %s", body)
	}

	// Only owners rotate; the old code stops working.
	res, body = bob.do("POST", "/api/v1/workspaces/current/invite-code/rotate", nil, true)
	expect(t, res, body, 403)
	res, body = alice.do("POST", "/api/v1/workspaces/current/invite-code/rotate", nil, true)
	expect(t, res, body, 200)
	if newCode := decodeInto[struct{ InviteCode string }](t, body).InviteCode; newCode == code || len(newCode) != 26 {
		t.Fatalf("rotated code %q", newCode)
	}
	carol := newClient(t, base)
	carol.signIn("Carol", "carol@example.com", "/")
	res, body = carol.do("POST", "/api/v1/workspaces/join", map[string]string{"inviteCode": code}, true)
	expect(t, res, body, 404)

	// Alice creates a second workspace, then switches back.
	res, body = alice.do("POST", "/api/v1/workspaces", map[string]string{"name": "Beta"}, true)
	expect(t, res, body, 201)
	res, body = alice.do("POST", "/api/v1/workspaces/switch", map[string]string{"workspaceId": acme.Active.ID}, true)
	expect(t, res, body, 200)
	res, body = alice.do("GET", "/api/v1/workspaces", nil, false)
	l := decodeInto[workspaceList](t, body)
	if len(l.Workspaces) != 2 || l.Active == nil || l.Active.ID != acme.Active.ID {
		t.Fatalf("after switch: %s", body)
	}
	res, body = alice.do("POST", "/api/v1/workspaces/switch", map[string]string{"workspaceId": "00000000-0000-0000-0000-000000000000"}, true)
	expect(t, res, body, 404)
	res, body = carol.do("POST", "/api/v1/workspaces/switch", map[string]string{"workspaceId": acme.Active.ID}, true)
	expect(t, res, body, 404)

	// A new session remembers the last active workspace.
	alice2 := newClient(t, base)
	alice2.signIn("Alice", "alice@example.com", "/")
	res, body = alice2.do("GET", "/api/v1/workspaces", nil, false)
	if l := decodeInto[workspaceList](t, body); l.Active == nil || l.Active.ID != acme.Active.ID {
		t.Fatalf("new session active: %s", body)
	}

	// Sign out revokes the session.
	res, body = alice.do("POST", "/api/v1/auth/logout", nil, true)
	expect(t, res, body, 204)
	res, body = alice.do("GET", "/api/v1/auth/me", nil, false)
	expect(t, res, body, 401)
}

func TestLoginFailures(t *testing.T) {
	base := newServer(t)
	c := newClient(t, base)

	// Callback without the flow cookie → state error.
	res, _ := c.do("GET", "/api/v1/auth/google/callback?state=x&code=y", nil, false)
	if loc := res.Header.Get("Location"); loc != "/login?error=state" {
		t.Fatalf("missing flow cookie → %q", loc)
	}

	start := func() url.Values {
		res, _ := c.do("GET", "/api/v1/auth/google/login?returnTo=//evil.example", nil, false)
		u, _ := url.Parse(res.Header.Get("Location"))
		return u.Query()
	}

	// User cancels at the provider → denied.
	q := start()
	res = c.postForm("/api/v1/auth/dev/authorize", url.Values{"state": {q.Get("state")}, "nonce": {q.Get("nonce")}, "deny": {"1"}})
	res, _ = c.do("GET", res.Header.Get("Location"), nil, false)
	if loc := res.Header.Get("Location"); loc != "/login?error=denied" {
		t.Fatalf("deny → %q", loc)
	}

	// Tampered code → oauth.
	q = start()
	res, _ = c.do("GET", "/api/v1/auth/google/callback?state="+q.Get("state")+"&code=forged.code", nil, false)
	if loc := res.Header.Get("Location"); loc != "/login?error=oauth" {
		t.Fatalf("forged code → %q", loc)
	}

	// Wrong state → state; flow cookie is single-use.
	q = start()
	res, _ = c.do("GET", "/api/v1/auth/google/callback?state=other&code=x", nil, false)
	if loc := res.Header.Get("Location"); loc != "/login?error=state" {
		t.Fatalf("state mismatch → %q", loc)
	}

	// Open-redirect attempts fall back to "/".
	q = start()
	res = c.postForm("/api/v1/auth/dev/authorize", url.Values{"state": {q.Get("state")}, "nonce": {q.Get("nonce")}, "name": {"Eve"}, "email": {"eve@example.com"}})
	res, _ = c.do("GET", res.Header.Get("Location"), nil, false)
	if loc := res.Header.Get("Location"); loc != "/" {
		t.Fatalf("returnTo //evil.example → %q", loc)
	}

	// Invalid dev form re-renders with 422.
	q = start()
	res = c.postForm("/api/v1/auth/dev/authorize", url.Values{"state": {q.Get("state")}, "nonce": {q.Get("nonce")}, "name": {""}, "email": {"not-an-email"}})
	if res.StatusCode != 422 {
		t.Fatalf("invalid dev form = %d", res.StatusCode)
	}
}
