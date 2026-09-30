-- 0007: markdown docs and their files (Sprint 6, ADR-0025).

CREATE TABLE docs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  title         text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  content       text NOT NULL DEFAULT '' CHECK (char_length(content) <= 200000),
  client_id     uuid REFERENCES clients (id) ON DELETE SET NULL,
  created_by    uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid REFERENCES users (id) ON DELETE SET NULL,
  version       integer NOT NULL DEFAULT 1
);
CREATE INDEX docs_workspace_idx ON docs (workspace_id, updated_at DESC);
CREATE INDEX docs_client_idx ON docs (client_id) WHERE client_id IS NOT NULL;

CREATE TABLE doc_files (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  doc_id        uuid NOT NULL REFERENCES docs (id) ON DELETE CASCADE,
  filename      text NOT NULL CHECK (char_length(filename) BETWEEN 1 AND 255),
  mime_type     text NOT NULL,
  size          bigint NOT NULL CHECK (size > 0 AND size <= 20971520),
  storage_key   text NOT NULL UNIQUE,
  status        text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'READY')),
  uploaded_by   uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX doc_files_doc_idx ON doc_files (doc_id, created_at);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['docs','doc_files'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY %I ON %I
      USING (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid)
      WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid)$p$,
      t || '_tenant', t);
  END LOOP;
END $$;
