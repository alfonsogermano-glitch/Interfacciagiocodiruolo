-- Staging permissions for an Aruba authentication API.
-- This creates only a NOLOGIN group role. A distinct LOGIN principal with a
-- secret generated locally on Aruba must be provisioned separately.
-- Apply only after schemas 001-004, and only after a rehearsed backup.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hollowgate_api_runtime') THEN
    CREATE ROLE hollowgate_api_runtime NOLOGIN NOINHERIT;
  END IF;
END $$;

REVOKE ALL ON SCHEMA hollowgate_auth FROM hollowgate_api_runtime;
REVOKE ALL ON ALL TABLES IN SCHEMA hollowgate_auth FROM hollowgate_api_runtime;

GRANT USAGE ON SCHEMA hollowgate_auth TO hollowgate_api_runtime;

-- User identities and roles must be read-only to normal login/session APIs.
GRANT SELECT (id, email, display_name, status, email_verified_at)
  ON hollowgate_auth.users TO hollowgate_api_runtime;
GRANT SELECT (user_id, role)
  ON hollowgate_auth.user_roles TO hollowgate_api_runtime;
GRANT SELECT (user_id, password_hash)
  ON hollowgate_auth.password_credentials TO hollowgate_api_runtime;

-- Session creation, authentication and logout; no DELETE and no updates
-- to session identities or token digests.
GRANT SELECT ON hollowgate_auth.sessions TO hollowgate_api_runtime;
GRANT INSERT (user_id, token_hash, expires_at)
  ON hollowgate_auth.sessions TO hollowgate_api_runtime;
GRANT UPDATE (revoked_at) ON hollowgate_auth.sessions TO hollowgate_api_runtime;

-- Atomic UPSERT for login and password-action rate-limit counters.
GRANT SELECT ON hollowgate_auth.rate_limit_buckets TO hollowgate_api_runtime;
GRANT INSERT (action, subject_digest, window_start, hits)
  ON hollowgate_auth.rate_limit_buckets TO hollowgate_api_runtime;
GRANT UPDATE (hits, updated_at)
  ON hollowgate_auth.rate_limit_buckets TO hollowgate_api_runtime;

-- Password creation/reset will require a separate deliberately reviewed
-- privileged workflow. Grant NO access to password_actions at this stage.
REVOKE ALL ON hollowgate_auth.password_actions FROM hollowgate_api_runtime;

COMMIT;
