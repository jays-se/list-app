-- 0002: users are identified by (auth_provider, auth_subject), not email (ADR-0017).
ALTER TABLE users
  ADD COLUMN auth_provider text NOT NULL DEFAULT 'unknown',
  ADD COLUMN auth_subject  text NOT NULL DEFAULT gen_random_uuid()::text;
ALTER TABLE users ALTER COLUMN auth_provider DROP DEFAULT;
ALTER TABLE users ALTER COLUMN auth_subject DROP DEFAULT;
CREATE UNIQUE INDEX users_identity_key ON users (auth_provider, auth_subject);

-- Email is profile data now; keep it indexed for lookups but not unique.
DROP INDEX users_email_key;
CREATE INDEX users_email_idx ON users (lower(email));

-- Session lookups by user (latest active workspace on sign-in).
CREATE INDEX sessions_user_created_idx ON sessions (user_id, created_at DESC);
