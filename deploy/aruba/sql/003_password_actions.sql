-- Aruba-only password setup/reset tokens; never accepts Supabase session tokens.
-- Raw tokens are delivered by email (future integration) and never persisted.
BEGIN;

CREATE TABLE IF NOT EXISTS hollowgate_auth.password_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES hollowgate_auth.users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('password_setup', 'password_reset')),
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CONSTRAINT action_expires_after_creation CHECK (expires_at > created_at),
  CONSTRAINT action_expiry_window CHECK (expires_at <= created_at + interval '30 minutes'),
  CONSTRAINT action_consume_after_create CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);

CREATE INDEX IF NOT EXISTS password_actions_user_idx
  ON hollowgate_auth.password_actions (user_id, expires_at)
  WHERE consumed_at IS NULL;

REVOKE ALL ON hollowgate_auth.password_actions FROM PUBLIC;
COMMIT;

-- Redemption must occur inside the SAME PostgreSQL transaction as:
-- 1) atomically claiming the token with UPDATE ... WHERE consumed_at IS NULL
--    AND expires_at > now() RETURNING user_id, purpose;
-- 2) setting the Argon2id password credential (only after verifying account state);
-- 3) revoking all pre-existing sessions for that user;
-- 4) committing.
-- If any step fails, roll back the entire transaction. Affected row count MUST
-- be exactly one. Application endpoints are intentionally not enabled yet.
