package db

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"os"
	"testing"
	"testing/fstest"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	dbresources "github.com/intellicars/list-app/apps/api/resources/db"
)

func TestLoadEmbeddedMigrations(t *testing.T) {
	migs, err := LoadMigrations(dbresources.Migrations)
	if err != nil {
		t.Fatal(err)
	}
	if len(migs) == 0 || migs[0].Version != 1 || migs[0].Name != "identity_tenancy" {
		t.Fatalf("unexpected migrations: %+v", migs)
	}
}

func TestLoadMigrationsValidation(t *testing.T) {
	cases := map[string]fstest.MapFS{
		"missing down": {"migrations/0001_a.up.sql": {Data: []byte("SELECT 1")}},
		"gap": {
			"migrations/0001_a.up.sql": {Data: []byte("x")}, "migrations/0001_a.down.sql": {Data: []byte("x")},
			"migrations/0003_c.up.sql": {Data: []byte("x")}, "migrations/0003_c.down.sql": {Data: []byte("x")},
		},
		"bad name":      {"migrations/1_a.up.sql": {Data: []byte("x")}},
		"name mismatch": {"migrations/0001_a.up.sql": {Data: []byte("x")}, "migrations/0001_b.down.sql": {Data: []byte("x")}},
	}
	for name, fsys := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := LoadMigrations(fsys); err == nil {
				t.Fatal("expected an error")
			}
		})
	}
}

func TestWithTenantRequiresIDs(t *testing.T) {
	err := WithTenant(context.Background(), nil, Tenant{}, func(pgx.Tx) error { return nil })
	if !errors.Is(err, ErrNoTenant) {
		t.Fatalf("got %v, want ErrNoTenant", err)
	}
}

// --- Postgres-backed tests (TEST_DATABASE_URL, e.g. the CI service) ---

// testPool returns a pool pinned to a fresh schema that is dropped afterwards.
func testPool(t *testing.T) (*pgxpool.Pool, string) {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	admin, err := Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	schema := "test_" + hex.EncodeToString(b)
	if _, err := admin.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = admin.Exec(ctx, "DROP SCHEMA "+schema+" CASCADE")
		admin.Close()
	})

	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
	cfg.ConnConfig.RuntimeParams["search_path"] = schema
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return pool, schema
}

func TestMigrateUpDownUp(t *testing.T) {
	pool, _ := testPool(t)
	ctx := context.Background()
	migs, err := LoadMigrations(dbresources.Migrations)
	if err != nil {
		t.Fatal(err)
	}
	m := NewMigrator(pool, migs)

	if applied, err := m.Up(ctx); err != nil || len(applied) != len(migs) {
		t.Fatalf("up: applied=%v err=%v", applied, err)
	}
	if applied, err := m.Up(ctx); err != nil || len(applied) != 0 {
		t.Fatalf("second up should be a no-op: applied=%v err=%v", applied, err)
	}
	if reverted, err := m.Down(ctx, len(migs)); err != nil || len(reverted) != len(migs) {
		t.Fatalf("down: reverted=%v err=%v", reverted, err)
	}
	if v, err := m.Version(ctx); err != nil || v != 0 {
		t.Fatalf("version after down = %d, %v", v, err)
	}
	if _, err := m.Up(ctx); err != nil {
		t.Fatalf("up after down: %v", err)
	}
}

// Tenant isolation must hold for the application role, which is never a
// superuser (superusers bypass RLS). The test switches to such a role.
func TestTenantIsolation(t *testing.T) {
	pool, schema := testPool(t)
	ctx := context.Background()
	migs, _ := LoadMigrations(dbresources.Migrations)
	if _, err := NewMigrator(pool, migs).Up(ctx); err != nil {
		t.Fatal(err)
	}

	role := schema + "_app"
	mustExec(t, pool, "CREATE ROLE "+role+" NOLOGIN NOSUPERUSER NOBYPASSRLS")
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, "DROP OWNED BY "+role)
		_, _ = pool.Exec(ctx, "DROP ROLE "+role)
	})
	mustExec(t, pool, "GRANT USAGE ON SCHEMA "+schema+" TO "+role)
	mustExec(t, pool, "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "+schema+" TO "+role)

	var alice, bob, wsA, wsB string
	mustScan(t, pool, `INSERT INTO users (email, name) VALUES ('a@x.io','Alice') RETURNING id`, &alice)
	mustScan(t, pool, `INSERT INTO users (email, name) VALUES ('b@x.io','Bob') RETURNING id`, &bob)
	mustScan(t, pool, `INSERT INTO workspaces (name, invite_code, created_by) VALUES ('A','code-a',$1) RETURNING id`, &wsA, alice)
	mustScan(t, pool, `INSERT INTO workspaces (name, invite_code, created_by) VALUES ('B','code-b',$1) RETURNING id`, &wsB, bob)
	mustExec(t, pool, `INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1,$2,'OWNER'),($3,$4,'OWNER')`, wsA, alice, wsB, bob)

	countAs := func(tn Tenant) int {
		var n int
		err := WithTenant(ctx, pool, tn, func(tx pgx.Tx) error {
			if _, err := tx.Exec(ctx, "SET LOCAL ROLE "+role); err != nil {
				return err
			}
			return tx.QueryRow(ctx, `SELECT count(*) FROM memberships`).Scan(&n)
		})
		if err != nil {
			t.Fatal(err)
		}
		return n
	}
	if n := countAs(Tenant{WorkspaceID: wsA, UserID: alice}); n != 1 {
		t.Fatalf("alice in A sees %d memberships, want 1", n)
	}

	err := WithTenant(ctx, pool, Tenant{WorkspaceID: wsA, UserID: alice}, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, "SET LOCAL ROLE "+role); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1,$2,'MEMBER')`, wsB, alice)
		return err
	})
	if err == nil {
		t.Fatal("inserting into another workspace must be rejected by RLS")
	}
}

func mustExec(t *testing.T, pool *pgxpool.Pool, sql string, args ...any) {
	t.Helper()
	if _, err := pool.Exec(context.Background(), sql, args...); err != nil {
		t.Fatalf("%s: %v", sql, err)
	}
}

func mustScan(t *testing.T, pool *pgxpool.Pool, sql string, dest *string, args ...any) {
	t.Helper()
	if err := pool.QueryRow(context.Background(), sql, args...).Scan(dest); err != nil {
		t.Fatalf("%s: %v", sql, err)
	}
}
