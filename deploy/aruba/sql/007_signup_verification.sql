-- 007: local-only signup + verification. Do not apply to production or Supabase.
-- SECURITY DEFINER functions narrow runtime permissions: no direct writes to users.
BEGIN;
CREATE TABLE IF NOT EXISTS hollowgate_auth.email_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES hollowgate_auth.users(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash)=32),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  consumed_at timestamptz,
  CONSTRAINT verified_expiry CHECK (expires_at>created_at AND expires_at<=created_at+interval '24 hours')
);
CREATE INDEX IF NOT EXISTS email_verifications_user_idx
  ON hollowgate_auth.email_verifications(user_id) WHERE consumed_at IS NULL;
REVOKE ALL ON hollowgate_auth.email_verifications FROM PUBLIC, hollowgate_api_runtime;

-- Uses only local source and always creates standard role. Never edits an
-- existing email, including a pending or migrated Supabase identity.
CREATE OR REPLACE FUNCTION hollowgate_auth.register_local_user(
  p_email text, p_display_name text, p_password_hash text, p_token_hash bytea)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  IF p_email IS NULL OR p_email <> lower(btrim(p_email))
     OR length(p_email) NOT BETWEEN 3 AND 320
     OR position('@' IN p_email) <= 1
     OR p_display_name IS NULL OR length(btrim(p_display_name)) NOT BETWEEN 1 AND 100
     OR p_password_hash IS NULL OR p_password_hash NOT LIKE '$argon2id$%'
     OR p_token_hash IS NULL OR octet_length(p_token_hash) <> 32 THEN
    RAISE EXCEPTION 'Invalid signup data' USING ERRCODE='22023';
  END IF;
  INSERT INTO hollowgate_auth.users
    (id,email,display_name,status,email_verified_at,source)
  VALUES (v_id,p_email,btrim(p_display_name),'pending_reset',NULL,'local')
  ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN false; END IF;

  INSERT INTO hollowgate_auth.user_roles(user_id,role) VALUES(v_id,'standard');
  INSERT INTO hollowgate_auth.password_credentials(user_id,password_hash)
    VALUES(v_id,p_password_hash);
  INSERT INTO hollowgate_auth.email_verifications(user_id,token_hash,expires_at)
    VALUES(v_id,p_token_hash,now()+interval '24 hours');
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION hollowgate_auth.confirm_local_email(p_token_hash bytea)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_user uuid;
BEGIN
  IF p_token_hash IS NULL OR octet_length(p_token_hash)<>32 THEN RETURN false; END IF;
  UPDATE hollowgate_auth.email_verifications ev
    SET consumed_at=now()
    FROM hollowgate_auth.users u
    WHERE ev.token_hash=p_token_hash
      AND ev.user_id=u.id
      AND ev.consumed_at IS NULL AND ev.expires_at>now()
      AND u.source='local' AND u.status='pending_reset'
      AND u.email_verified_at IS NULL
    RETURNING ev.user_id INTO v_user;
  IF v_user IS NULL THEN RETURN false; END IF;
  UPDATE hollowgate_auth.users
    SET status='active', email_verified_at=now(),updated_at=now()
    WHERE id=v_user AND source='local' AND status='pending_reset'
      AND email_verified_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unable to confirm local user'; END IF;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION hollowgate_auth.register_local_user(text,text,text,bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_auth.confirm_local_email(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_auth.register_local_user(text,text,text,bytea)
  TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_auth.confirm_local_email(bytea)
  TO hollowgate_api_runtime;
COMMIT;
