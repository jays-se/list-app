-- 0006: capture source on tasks + idempotency keys (Sprint 5, ADR-0024).

ALTER TABLE tasks ADD COLUMN source text CHECK (source IN ('MEETING_NOTE', 'PERSONAL'));

CREATE TABLE idempotency_keys (
  workspace_id  uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  key           text NOT NULL CHECK (char_length(key) BETWEEN 8 AND 200),
  request_hash  text NOT NULL,
  status_code   integer,
  response      text,  -- replayed byte-for-byte
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);
CREATE INDEX idempotency_keys_created_idx ON idempotency_keys (created_at);

ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY idempotency_keys_tenant ON idempotency_keys
  USING (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid);
