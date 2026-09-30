-- 0005: change requests, outbox, notifications (Sprint 4, ADR-0023).

CREATE TABLE change_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  task_id       uuid NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('UPDATE','ASSIGNEE_ADD','ASSIGNEE_REMOVE','SUBTASK_ADD',
                                              'CHECKLIST_ADD','CHECKLIST_UPDATE','CHECKLIST_REMOVE','ATTACHMENT_REMOVE')),
  status        text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELED')),
  payload       jsonb NOT NULL,
  summary       text NOT NULL,
  note          text CHECK (char_length(note) <= 1000),
  review_note   text CHECK (char_length(review_note) <= 1000),
  base_version  integer NOT NULL,
  requester_id  uuid REFERENCES users (id) ON DELETE SET NULL,
  reviewer_id   uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  decided_at    timestamptz
);
CREATE INDEX change_requests_task_idx ON change_requests (task_id, created_at DESC);
CREATE INDEX change_requests_pending_idx ON change_requests (task_id) WHERE status = 'PENDING';

-- System table (no RLS; never exposed to handlers) — see ADR-0023.
CREATE TABLE outbox (
  id            bigserial PRIMARY KEY,
  workspace_id  uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  kind          text NOT NULL,
  payload       jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  available_at  timestamptz NOT NULL DEFAULT now(),
  processed_at  timestamptz,
  attempts      integer NOT NULL DEFAULT 0,
  last_error    text
);
CREATE INDEX outbox_pending_idx ON outbox (available_at, id) WHERE processed_at IS NULL;

CREATE TABLE notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('MENTION','ASSIGNED','STATUS','DUE','REQUEST','REVIEWED')),
  task_id       uuid REFERENCES tasks (id) ON DELETE SET NULL,
  task_title    text,
  actor_id      uuid REFERENCES users (id) ON DELETE SET NULL,
  detail        text NOT NULL,
  comment_body  text,
  dedupe_key    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  read_at       timestamptz,
  UNIQUE (user_id, dedupe_key)
);
CREATE INDEX notifications_inbox_idx ON notifications (workspace_id, user_id, created_at DESC);
CREATE INDEX notifications_unread_idx ON notifications (workspace_id, user_id) WHERE read_at IS NULL;

-- Per-user preferences (not workspace-scoped); absent row = enabled.
CREATE TABLE notification_settings (
  user_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind     text NOT NULL CHECK (kind IN ('MENTION','ASSIGNED','STATUS','DUE','REQUEST','REVIEWED')),
  enabled  boolean NOT NULL,
  PRIMARY KEY (user_id, kind)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['change_requests','notifications'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY %I ON %I
      USING (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid)
      WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid)$p$,
      t || '_tenant', t);
  END LOOP;
END $$;
