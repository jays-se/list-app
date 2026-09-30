-- 0003: tasks, assignees, owners, labels (E4-S1, E4-S5, E8-S2).
-- Every table carries workspace_id and is RLS-scoped to app.workspace_id.

CREATE TABLE labels (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  color         text NOT NULL CHECK (color IN ('gray','red','orange','yellow','green','teal','blue','purple','pink')),
  created_by    uuid NOT NULL REFERENCES users (id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX labels_workspace_name_key ON labels (workspace_id, lower(name));

CREATE TABLE tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  title         text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 500),
  description   text,
  status        text NOT NULL DEFAULT 'TODO'
                CHECK (status IN ('BACKLOG','TODO','IN_PROGRESS','TESTING','DONE','CANCELED')),
  priority      text NOT NULL DEFAULT 'NONE'
                CHECK (priority IN ('URGENT','HIGH','MEDIUM','LOW','NONE')),
  start_date    date NOT NULL,
  end_date      date NOT NULL,
  due_date      date,
  created_by    uuid NOT NULL REFERENCES users (id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  version       integer NOT NULL DEFAULT 1,
  CONSTRAINT tasks_dates_ordered CHECK (end_date >= start_date)
);
CREATE INDEX tasks_workspace_due_idx ON tasks (workspace_id, due_date NULLS LAST, created_at DESC);
CREATE INDEX tasks_workspace_status_idx ON tasks (workspace_id, status);

CREATE TABLE task_assignees (
  workspace_id  uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  task_id       uuid NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, user_id)
);
CREATE INDEX task_assignees_user_idx ON task_assignees (workspace_id, user_id);

CREATE TABLE task_owners (
  workspace_id  uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  task_id       uuid NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, user_id)
);

CREATE TABLE task_labels (
  workspace_id  uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  task_id       uuid NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  label_id      uuid NOT NULL REFERENCES labels (id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, label_id)
);
CREATE INDEX task_labels_label_idx ON task_labels (label_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['labels','tasks','task_assignees','task_owners','task_labels'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY %I ON %I
      USING (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid)
      WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid)$p$,
      t || '_tenant', t);
  END LOOP;
END $$;
