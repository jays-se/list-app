DROP TABLE IF EXISTS task_status_stages;
DROP TABLE IF EXISTS task_events;
DROP TABLE IF EXISTS attachments;
DROP TABLE IF EXISTS comment_mentions;
DROP TABLE IF EXISTS comments;
DROP TABLE IF EXISTS checklist_items;
ALTER TABLE tasks DROP COLUMN IF EXISTS parent_id, DROP COLUMN IF EXISTS client_id;
DROP TABLE IF EXISTS clients;
