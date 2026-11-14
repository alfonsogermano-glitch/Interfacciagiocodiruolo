-- Hollowgate Aruba auth staging schema, revision 002.
-- All session tokens are random opaque 256-bit values; store SHA-256 only.
-- Existing Supabase sessions are NOT imported or accepted by this service.
BEGIN;
CREATE TABLE IF NOT EXISTS hollowgate_auth.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES hollowgate_auth.users(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_used_at timestamptz,
  CONSTRAINT sessions_token_hash_size CHECK (octet_length(token_hash) = 32),
  CONSTRAINT sessions_expiry_after_creation CHECK (expires_at > created_at),
  CONSTRAINT sessions_revocation_after_creation CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);
CREATE INDEX IF NOT EXISTS sessions_active_user_idx
  ON hollowgate_auth.sessions(user_id, expires_at)
  WHERE revoked_at IS NULL;
REVOKE ALL ON hollowgate_auth.sessions FROM PUBLIC;
COMMIT;
