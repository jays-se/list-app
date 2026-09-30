-- 0001 identity & tenancy: users, sessions, workspaces, memberships.
-- Feature tables arrive with their feature tickets (incremental schema).

CREATE TABLE users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL,
  name        text NOT NULL,
  image_url   text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));

CREATE TABLE workspaces (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  invite_code  text NOT NULL UNIQUE,
  created_by   uuid NOT NULL REFERENCES users (id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  workspace_id  uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role          text NOT NULL CHECK (role IN ('OWNER', 'MEMBER')),
  joined_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX memberships_user_idx ON memberships (user_id);

-- Server-side sessions (ADR-0008). The cookie holds an opaque id; only its
-- SHA-256 hash is stored.
CREATE TABLE sessions (
  id_hash              bytea PRIMARY KEY,
  user_id              uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  active_workspace_id  uuid REFERENCES workspaces (id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  expires_at           timestamptz NOT NULL,
  revoked_at           timestamptz
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

-- Tenant isolation (backend-go rule §10): every workspace-scoped query runs in
-- a transaction that sets app.workspace_id / app.user_id (see internal/db).
-- FORCE applies the policy to the table owner too.
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY memberships_tenant ON memberships
  USING (
    workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid
    OR user_id = nullif(current_setting('app.user_id', true), '')::uuid
  )
  WITH CHECK (
    workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid
  );
