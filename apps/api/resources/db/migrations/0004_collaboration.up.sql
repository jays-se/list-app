-- 0004: clients, subtasks, checklist, comments, attachments, history (Sprint 3).

CREATE TABLE clients (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  email         text,
  phone         text,
  color         text NOT NULL CHECK (color IN ('gray','red','orange','yellow','green','teal','blue','purple','pink')),
  notes         text,
  created_by    uuid NOT NULL REFERENCES users (id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX clients_workspace_idx ON clients (workspace_id, lower(name));

-- Deleting a client unlinks its tasks (reference behaviour); deleting a
-- parent task deletes its subtasks.
ALTER TABLE tasks
  ADD COLUMN client_id uuid REFERENCES clients (id) ON DELETE SET NULL,
  ADD COLUMN parent_id uuid REFERENCES tasks (id) ON DELETE CASCADE;
CREATE INDEX tasks_client_idx ON tasks (client_id) WHERE client_id IS NOT NULL;
CREATE INDEX tasks_parent_idx ON tasks (parent_id) WHERE parent_id IS NOT NULL;

CREATE TABLE checklist_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  task_id       uuid NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  title         text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  done          boolean NOT NULL DEFAULT false,
  assignee_id   uuid REFERENCES users (id) ON DELETE SET NULL,
  position      integer NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX checklist_task_idx ON checklist_items (task_id, position);

CREATE TABLE comments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  task_id       uuid NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  author_id     uuid REFERENCES users (id) ON DELETE SET NULL,
  body          text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX comments_task_idx ON comments (task_id, created_at);

CREATE TABLE comment_mentions (
  workspace_id  uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  comment_id    uuid NOT NULL REFERENCES comments (id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  PRIMARY KEY (comment_id, user_id)
);

CREATE TABLE attachments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  task_id       uuid NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  filename      text NOT NULL CHECK (char_length(filename) BETWEEN 1 AND 255),
  mime_type     text NOT NULL,
  size          bigint NOT NULL CHECK (size BETWEEN 1 AND 5242880),
  storage_key   text NOT NULL UNIQUE,
  status        text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','READY')),
  uploaded_by   uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attachments_task_idx ON attachments (task_id, created_at);

-- Append-only activity feed (E6-S1).
CREATE TABLE task_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  task_id       uuid NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  actor_id      uuid REFERENCES users (id) ON DELETE SET NULL,
  kind          text NOT NULL,
  field         text,
  from_value    text,
  to_value      text,
  subject       text,
  created_at    timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX task_events_task_idx ON task_events (task_id, created_at DESC);

-- One open stage (left_at NULL) per task; closed and reopened on status change.
CREATE TABLE task_status_stages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  task_id       uuid NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  status        text NOT NULL,
  entered_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  left_at       timestamptz
);
CREATE UNIQUE INDEX task_status_open_idx ON task_status_stages (task_id) WHERE left_at IS NULL;
CREATE INDEX task_status_task_idx ON task_status_stages (task_id, entered_at);

-- Backfill: every existing task starts a stage in its current status.
INSERT INTO task_status_stages (workspace_id, task_id, status, entered_at)
SELECT workspace_id, id, status, created_at FROM tasks;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['clients','checklist_items','comments','comment_mentions','attachments','task_events','task_status_stages'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY %I ON %I
      USING (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid)
      WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid)$p$,
      t || '_tenant', t);
  END LOOP;
END $$;
