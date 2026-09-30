DROP INDEX IF EXISTS sessions_user_created_idx;
DROP INDEX IF EXISTS users_email_idx;
CREATE UNIQUE INDEX users_email_key ON users (lower(email));
DROP INDEX IF EXISTS users_identity_key;
ALTER TABLE users DROP COLUMN auth_subject, DROP COLUMN auth_provider;
