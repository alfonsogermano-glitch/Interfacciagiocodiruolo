-- Hollowgate Aruba auth staging schema, revision 001.
-- No live user data is copied or changed by this file.
-- Importers must preserve the original Supabase auth.users.id UUID.
BEGIN;

CREATE SCHEMA IF NOT EXISTS hollowgate_auth;
REVOKE ALL ON SCHEMA hollowgate_auth FROM PUBLIC;

CREATE TABLE IF NOT EXISTS hollowgate_auth.users (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending_reset'
    CHECK (status IN ('pending_reset', 'active', 'disabled')),
  email_verified_at timestamptz,
  source text NOT NULL DEFAULT 'local'
    CHECK (source IN ('local', 'supabase')),
  source_created_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_canonical CHECK (
    email = lower(btrim(email))
    AND length(email) BETWEEN 3 AND 320
    AND position('@' IN email) > 1
  ),
  CONSTRAINT users_display_name_nonempty CHECK (length(btrim(display_name)) > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx
  ON hollowgate_auth.users (email);

CREATE TABLE IF NOT EXISTS hollowgate_auth.user_roles (
  user_id uuid PRIMARY KEY REFERENCES hollowgate_auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'standard' CHECK (role IN ('standard', 'admin'))
);

-- Credentials intentionally remain empty for Supabase-imported users.
-- Password enrollment must use a future verified, rate-limited reset flow.
CREATE TABLE IF NOT EXISTS hollowgate_auth.password_credentials (
  user_id uuid PRIMARY KEY REFERENCES hollowgate_auth.users(id) ON DELETE CASCADE,
  password_hash text NOT NULL
    CHECK (password_hash LIKE '$argon2id$%' AND length(password_hash) BETWEEN 40 AND 512),
  changed_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON ALL TABLES IN SCHEMA hollowgate_auth FROM PUBLIC;
COMMIT;
