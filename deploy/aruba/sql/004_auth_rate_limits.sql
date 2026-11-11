-- Private abuse-control counters for future authentication endpoints.
-- Caller provides only keyed HMAC-SHA256 identifiers (never emails, IPs or
-- reversible identifiers). Enforcement requires atomic INSERT .. ON CONFLICT.
BEGIN;

CREATE TABLE IF NOT EXISTS hollowgate_auth.rate_limit_buckets (
  action text NOT NULL CHECK (action IN ('login','signup','password_reset','password_setup')),
  subject_digest bytea NOT NULL CHECK (octet_length(subject_digest) = 32),
  window_start timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 1 CHECK (hits >= 1),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (action, subject_digest, window_start)
);

REVOKE ALL ON hollowgate_auth.rate_limit_buckets FROM PUBLIC;

CREATE INDEX IF NOT EXISTS rate_limit_buckets_cleanup_idx
ON hollowgate_auth.rate_limit_buckets(window_start);

COMMIT;

-- The future API must use a dedicated least-privilege DB role and enforce
-- the threshold within the same atomic UPSERT statement. Buckets must be
-- derived using a server-only secret, combining action + subject (account
-- and network separately). Never trust client-provided forwarded IP headers
-- without a defined reverse-proxy trust boundary.
