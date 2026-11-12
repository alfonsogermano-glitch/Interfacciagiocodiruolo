-- 026: Read-only, owner-authorized campaign roster, independent of Supabase.
-- No invitations or role changes exposed through HTTP in this migration.
BEGIN;
CREATE FUNCTION hollowgate_vtt.list_owned_campaign_roster(p_owner uuid,p_campaign uuid)
RETURNS TABLE(user_id uuid,display_name text,member_role text,joined_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 WITH allowed_campaign AS (
  SELECT c.id,c.owner_id,c.created_at FROM hollowgate_vtt.campaigns c
  JOIN hollowgate_auth.users owner_u ON owner_u.id=c.owner_id
  WHERE c.id=p_campaign AND c.owner_id=p_owner
    AND owner_u.status='active' AND owner_u.email_verified_at IS NOT NULL
 ), roster AS (
  SELECT c.owner_id user_id,'gm'::text member_role,c.created_at joined_at
  FROM allowed_campaign c
  UNION ALL
  SELECT m.user_id,m.member_role,m.created_at FROM hollowgate_vtt.campaign_members m
  JOIN allowed_campaign c ON c.id=m.campaign_id
  WHERE m.status='active' AND m.user_id<>c.owner_id
 )
 SELECT r.user_id,u.display_name,r.member_role,r.joined_at
 FROM roster r JOIN hollowgate_auth.users u ON u.id=r.user_id
 WHERE u.status='active' AND u.email_verified_at IS NOT NULL
 ORDER BY CASE WHEN r.member_role='gm' THEN 0 ELSE 1 END,r.joined_at,r.user_id
 LIMIT 101
$$;
REVOKE ALL ON FUNCTION hollowgate_vtt.list_owned_campaign_roster(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.list_owned_campaign_roster(uuid,uuid)
 TO hollowgate_api_runtime;
COMMIT;
