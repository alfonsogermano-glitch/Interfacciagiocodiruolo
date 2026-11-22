-- 033: expiring campaign invite codes. Only SHA-256 digests are persisted.
-- Generation remains in the API process; runtime receives no direct table access.
BEGIN;
CREATE TABLE hollowgate_vtt.campaign_invites (
 campaign_id uuid PRIMARY KEY REFERENCES hollowgate_vtt.campaigns(id) ON DELETE CASCADE,
 code_digest bytea NOT NULL UNIQUE CHECK(octet_length(code_digest)=32),
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON hollowgate_vtt.campaign_invites FROM PUBLIC,hollowgate_api_runtime;

CREATE FUNCTION hollowgate_vtt.rotate_owned_campaign_invite(
 p_owner uuid,p_campaign uuid,p_digest bytea,p_expires timestamptz)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF p_digest IS NULL OR octet_length(p_digest)<>32 OR p_expires IS NULL
    OR p_expires<=now() OR p_expires>now()+interval '8 days' THEN
  RAISE EXCEPTION 'Invalid invite' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM hollowgate_vtt.campaigns c
  JOIN hollowgate_auth.users u ON u.id=c.owner_id
  WHERE c.id=p_campaign AND c.owner_id=p_owner AND u.status='active'
   AND u.email_verified_at IS NOT NULL) THEN RETURN NULL;END IF;
 INSERT INTO hollowgate_vtt.campaign_invites(campaign_id,code_digest,expires_at)
 VALUES(p_campaign,p_digest,p_expires)
 ON CONFLICT(campaign_id) DO UPDATE SET code_digest=EXCLUDED.code_digest,
  expires_at=EXCLUDED.expires_at,updated_at=now();
 RETURN p_campaign;
END $$;

CREATE FUNCTION hollowgate_vtt.preview_campaign_invite(p_user uuid,p_digest bytea)
RETURNS TABLE(id uuid,owner_id uuid,name text,description text,ruleset text,created_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT c.id,c.owner_id,c.name,c.description,c.ruleset,c.created_at
 FROM hollowgate_vtt.campaign_invites i
 JOIN hollowgate_vtt.campaigns c ON c.id=i.campaign_id
 JOIN hollowgate_auth.users actor ON actor.id=p_user
 JOIN hollowgate_auth.users owner_u ON owner_u.id=c.owner_id
 WHERE i.code_digest=p_digest AND octet_length(p_digest)=32 AND i.expires_at>now()
  AND p_user<>c.owner_id AND actor.status='active' AND actor.email_verified_at IS NOT NULL
  AND owner_u.status='active' AND owner_u.email_verified_at IS NOT NULL
 LIMIT 1
$$;

CREATE FUNCTION hollowgate_vtt.join_campaign_by_invite(p_user uuid,p_digest bytea)
RETURNS TABLE(id uuid,owner_id uuid,name text,description text,ruleset text,created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_campaign uuid;
BEGIN
 SELECT i.campaign_id INTO v_campaign FROM hollowgate_vtt.campaign_invites i
 JOIN hollowgate_vtt.campaigns c ON c.id=i.campaign_id
 JOIN hollowgate_auth.users actor ON actor.id=p_user
 JOIN hollowgate_auth.users owner_u ON owner_u.id=c.owner_id
 WHERE i.code_digest=p_digest AND octet_length(p_digest)=32 AND i.expires_at>now()
  AND p_user<>c.owner_id AND actor.status='active' AND actor.email_verified_at IS NOT NULL
  AND owner_u.status='active' AND owner_u.email_verified_at IS NOT NULL
 FOR UPDATE OF i;
 IF v_campaign IS NULL THEN RETURN;END IF;
 INSERT INTO hollowgate_vtt.campaign_members(campaign_id,user_id,member_role,status)
 VALUES(v_campaign,p_user,'player','active')
 ON CONFLICT(campaign_id,user_id) DO UPDATE SET member_role='player',status='active',updated_at=now();
 RETURN QUERY SELECT c.id,c.owner_id,c.name,c.description,c.ruleset,c.created_at
  FROM hollowgate_vtt.campaigns c WHERE c.id=v_campaign;
END $$;

REVOKE ALL ON FUNCTION hollowgate_vtt.rotate_owned_campaign_invite(uuid,uuid,bytea,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.preview_campaign_invite(uuid,bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.join_campaign_by_invite(uuid,bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.rotate_owned_campaign_invite(uuid,uuid,bytea,timestamptz) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.preview_campaign_invite(uuid,bytea) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.join_campaign_by_invite(uuid,bytea) TO hollowgate_api_runtime;
COMMIT;
