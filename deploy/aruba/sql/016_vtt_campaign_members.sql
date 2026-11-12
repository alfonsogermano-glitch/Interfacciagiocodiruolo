-- 016: Server-authorized campaign memberships and privacy-safe notes read.
-- This is a CI-only foundation, not a member invitation UI or a live endpoint.
BEGIN;
CREATE TABLE hollowgate_vtt.campaign_members (
 campaign_id uuid NOT NULL REFERENCES hollowgate_vtt.campaigns(id) ON DELETE RESTRICT,
 user_id uuid NOT NULL REFERENCES hollowgate_auth.users(id) ON DELETE RESTRICT,
 member_role text NOT NULL CHECK(member_role IN ('gm','player')),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(campaign_id,user_id)
);
CREATE INDEX campaign_members_user_idx
 ON hollowgate_vtt.campaign_members(user_id,status,campaign_id);
REVOKE ALL ON hollowgate_vtt.campaign_members FROM PUBLIC,hollowgate_api_runtime;

-- There is no global GM role: role is determined independently in each campaign.
-- A campaign owner always resolves as GM without duplicating membership rows.
CREATE FUNCTION hollowgate_vtt.campaign_member_role(p_user uuid,p_campaign uuid)
RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT CASE
  WHEN c.owner_id=p_user THEN 'gm'
  ELSE (SELECT m.member_role FROM hollowgate_vtt.campaign_members m
        WHERE m.campaign_id=c.id AND m.user_id=p_user AND m.status='active')
 END
 FROM hollowgate_vtt.campaigns c
 JOIN hollowgate_auth.users u ON u.id=p_user
 WHERE c.id=p_campaign AND u.status='active' AND u.email_verified_at IS NOT NULL
 LIMIT 1
$$;

-- Membership changes are owner-controlled and require a verified, active target.
-- Revocation is reversible and retains the audit trail.
CREATE FUNCTION hollowgate_vtt.set_campaign_membership(
 p_owner uuid,p_campaign uuid,p_member uuid,p_role text,p_active boolean)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
 IF p_role IS NULL OR p_role NOT IN ('gm','player') OR p_active IS NULL THEN
  RAISE EXCEPTION 'Invalid member role' USING ERRCODE='22023';
 END IF;
 IF p_member=p_owner OR NOT EXISTS(
  SELECT 1 FROM hollowgate_vtt.campaigns c
  JOIN hollowgate_auth.users owner_u ON owner_u.id=c.owner_id
  WHERE c.id=p_campaign AND c.owner_id=p_owner AND owner_u.status='active'
   AND owner_u.email_verified_at IS NOT NULL
 ) THEN RETURN NULL;END IF;
 IF p_active THEN
  IF NOT EXISTS(
    SELECT 1 FROM hollowgate_auth.users u WHERE u.id=p_member
     AND u.status='active' AND u.email_verified_at IS NOT NULL
  ) THEN RETURN NULL;END IF;
  INSERT INTO hollowgate_vtt.campaign_members(campaign_id,user_id,member_role,status)
  VALUES(p_campaign,p_member,p_role,'active')
  ON CONFLICT(campaign_id,user_id)
  DO UPDATE SET member_role=EXCLUDED.member_role,status='active',updated_at=now()
  RETURNING user_id INTO v_id;
 ELSE
  UPDATE hollowgate_vtt.campaign_members
  SET status='revoked',updated_at=now()
  WHERE campaign_id=p_campaign AND user_id=p_member AND status='active'
  RETURNING user_id INTO v_id;
 END IF;
 RETURN v_id;
END $$;

-- Root and child notes inherit parent visibility. GM can read all shared notes
-- and their own private notes; owner can read all, but players cannot read
-- private notes even by knowing an exact parent UUID.
CREATE FUNCTION hollowgate_vtt.list_member_campaign_notes(
 p_user uuid,p_campaign uuid,p_parent uuid DEFAULT NULL)
RETURNS TABLE(id uuid,title text,content_rich jsonb,parent_note_id uuid,
 tab_position integer,visibility text)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 WITH role_access AS (
  SELECT hollowgate_vtt.campaign_member_role(p_user,p_campaign) AS member_role,
         c.owner_id FROM hollowgate_vtt.campaigns c WHERE c.id=p_campaign
 )
 SELECT n.id,n.title,n.content_rich,n.parent_note_id,n.position,n.visibility
 FROM hollowgate_vtt.campaign_notes n
 CROSS JOIN role_access a
 LEFT JOIN hollowgate_vtt.campaign_notes parent ON parent.id=n.parent_note_id
 WHERE n.campaign_id=p_campaign AND n.status='active'
  AND n.parent_note_id IS NOT DISTINCT FROM p_parent
  AND a.member_role IS NOT NULL
  AND (n.visibility='all' OR n.creator_id=p_user OR a.owner_id=p_user)
  AND (p_parent IS NULL OR
   (parent.id=p_parent AND parent.campaign_id=p_campaign
    AND parent.parent_note_id IS NULL AND parent.status='active'
    AND (parent.visibility='all' OR parent.creator_id=p_user OR a.owner_id=p_user)))
 ORDER BY n.position,n.created_at,n.id LIMIT 100
$$;

REVOKE ALL ON FUNCTION hollowgate_vtt.campaign_member_role(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.set_campaign_membership(uuid,uuid,uuid,text,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.list_member_campaign_notes(uuid,uuid,uuid) FROM PUBLIC;
-- Intentionally no direct INSERT/UPDATE/SELECT on campaign_members.
GRANT EXECUTE ON FUNCTION hollowgate_vtt.campaign_member_role(uuid,uuid) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.set_campaign_membership(uuid,uuid,uuid,text,boolean) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.list_member_campaign_notes(uuid,uuid,uuid) TO hollowgate_api_runtime;
COMMIT;
