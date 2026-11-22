-- OAuth identities are separate from password credentials and source UUIDs.
-- Apply only to an isolated staging DB after a backup and explicit review.
BEGIN;
CREATE TABLE IF NOT EXISTS hollowgate_auth.oauth_identities (
  provider text NOT NULL CHECK (provider IN ('google','discord')),
  subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 255),
  user_id uuid NOT NULL REFERENCES hollowgate_auth.users(id) ON DELETE CASCADE,
  linked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider,subject),
  UNIQUE (provider,user_id)
);
CREATE TABLE IF NOT EXISTS hollowgate_auth.oauth_attempts (
  state_digest bytea PRIMARY KEY CHECK (octet_length(state_digest)=32),
  browser_digest bytea NOT NULL CHECK (octet_length(browser_digest)=32),
  provider text NOT NULL CHECK (provider IN ('google','discord')),
  code_verifier text NOT NULL CHECK (length(code_verifier)=43),
  nonce text CHECK (nonce IS NULL OR length(nonce)=43),
  link_user_id uuid REFERENCES hollowgate_auth.users(id) ON DELETE CASCADE,
  link_session_digest bytea CHECK (link_session_digest IS NULL OR octet_length(link_session_digest)=32),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON hollowgate_auth.oauth_identities,hollowgate_auth.oauth_attempts FROM PUBLIC;
REVOKE ALL ON hollowgate_auth.oauth_identities,hollowgate_auth.oauth_attempts FROM hollowgate_api_runtime;
ALTER TABLE hollowgate_auth.rate_limit_buckets
  DROP CONSTRAINT IF EXISTS rate_limit_buckets_action_check;
ALTER TABLE hollowgate_auth.rate_limit_buckets
  ADD CONSTRAINT rate_limit_buckets_action_check
  CHECK (action IN ('login','signup','password_reset','password_setup','oauth_start'));

-- Only two dedicated functions can touch short-lived state, never table grants.
CREATE OR REPLACE FUNCTION hollowgate_auth.begin_oauth(
  p_state bytea,p_browser bytea,p_provider text,p_verifier text,p_nonce text,p_link uuid,p_link_session bytea
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF octet_length(p_state)<>32 OR octet_length(p_browser)<>32 OR
     p_provider NOT IN ('google','discord') OR length(p_verifier)<>43 OR
     (p_nonce IS NOT NULL AND length(p_nonce)<>43) OR
     (p_provider='google' AND p_nonce IS NULL) OR
     (p_provider='discord' AND p_nonce IS NOT NULL) OR
     (p_link IS NULL AND p_link_session IS NOT NULL) OR
     (p_link IS NOT NULL AND (p_link_session IS NULL OR octet_length(p_link_session)<>32)) THEN
    RAISE EXCEPTION 'Invalid OAuth attempt';
  END IF;
  INSERT INTO hollowgate_auth.oauth_attempts
    (state_digest,browser_digest,provider,code_verifier,nonce,link_user_id,link_session_digest,expires_at)
  VALUES(p_state,p_browser,p_provider,p_verifier,p_nonce,p_link,p_link_session,now()+interval '10 minutes');
END $$;

CREATE OR REPLACE FUNCTION hollowgate_auth.consume_oauth(
  p_state bytea,p_browser bytea,p_provider text
) RETURNS TABLE(code_verifier text,nonce text,link_user_id uuid,link_session_digest bytea)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  RETURN QUERY DELETE FROM hollowgate_auth.oauth_attempts a
    WHERE a.state_digest=p_state AND a.browser_digest=p_browser
      AND a.provider=p_provider AND a.expires_at>now()
    RETURNING a.code_verifier,a.nonce,a.link_user_id,a.link_session_digest;
END $$;

-- Only the verified provider subject can resolve an existing identity.
-- Matching email alone NEVER links an existing account; authenticated linking
-- must prove the current local session and matching verified email.
CREATE OR REPLACE FUNCTION hollowgate_auth.finish_oauth(
  p_provider text,p_subject text,p_email text,p_name text,p_link uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_user uuid; v_existing uuid;
BEGIN
  IF p_provider NOT IN ('google','discord') OR length(p_subject) NOT BETWEEN 1 AND 255 OR
     length(p_email) NOT BETWEEN 3 AND 320 OR p_email<>lower(btrim(p_email)) OR
     position('@' IN p_email)<=1 OR length(btrim(p_name)) NOT BETWEEN 1 AND 100 THEN
    RETURN NULL;
  END IF;
  -- Serialize concurrent callbacks of the same provider identity.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_provider||':'||p_subject,0));
  SELECT i.user_id INTO v_existing FROM hollowgate_auth.oauth_identities i
    WHERE i.provider=p_provider AND i.subject=p_subject;
  IF v_existing IS NOT NULL THEN
    IF p_link IS NOT NULL AND p_link<>v_existing THEN RETURN NULL; END IF;
    SELECT u.id INTO v_user FROM hollowgate_auth.users u
      WHERE u.id=v_existing AND u.status='active' AND u.email_verified_at IS NOT NULL;
    RETURN v_user;
  END IF;
  IF p_link IS NOT NULL THEN
    SELECT u.id INTO v_user FROM hollowgate_auth.users u
      WHERE u.id=p_link AND u.email=p_email AND u.status='active'
        AND u.email_verified_at IS NOT NULL;
    IF v_user IS NULL THEN RETURN NULL; END IF;
  ELSE
    -- Existing email requires explicit account linking after password login.
    IF EXISTS (SELECT 1 FROM hollowgate_auth.users WHERE email=p_email) THEN RETURN NULL; END IF;
    v_user=pg_catalog.gen_random_uuid();
    INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source)
      VALUES(v_user,p_email,btrim(p_name),'active',now(),'local');
    INSERT INTO hollowgate_auth.user_roles(user_id,role) VALUES(v_user,'standard');
  END IF;
  INSERT INTO hollowgate_auth.oauth_identities(provider,subject,user_id)
    VALUES(p_provider,p_subject,v_user);
  RETURN v_user;
EXCEPTION WHEN unique_violation THEN
  -- Concurrent email/provider collisions never grant access by email alone.
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION hollowgate_auth.begin_oauth(bytea,bytea,text,text,text,uuid,bytea),
  hollowgate_auth.consume_oauth(bytea,bytea,text),
  hollowgate_auth.finish_oauth(text,text,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_auth.begin_oauth(bytea,bytea,text,text,text,uuid,bytea),
  hollowgate_auth.consume_oauth(bytea,bytea,text),
  hollowgate_auth.finish_oauth(text,text,text,text,uuid) TO hollowgate_api_runtime;
COMMIT;
