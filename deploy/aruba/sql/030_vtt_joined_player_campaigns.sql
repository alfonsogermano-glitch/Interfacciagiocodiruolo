-- 030: current verified player memberships, separate from GM-owned campaigns.
-- A player sees campaign metadata only where their own membership is active.
BEGIN;
CREATE FUNCTION hollowgate_vtt.list_joined_player_campaigns(p_player uuid)
RETURNS TABLE(id uuid,owner_id uuid,name text,description text,ruleset text,created_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT c.id,c.owner_id,c.name,c.description,c.ruleset,c.created_at
 FROM hollowgate_vtt.campaign_members m
 JOIN hollowgate_vtt.campaigns c ON c.id=m.campaign_id
 JOIN hollowgate_auth.users u ON u.id=m.user_id
   AND u.status='active' AND u.email_verified_at IS NOT NULL
 JOIN hollowgate_auth.users gm ON gm.id=c.owner_id
   AND gm.status='active' AND gm.email_verified_at IS NOT NULL
 WHERE m.user_id=p_player AND m.status='active' AND m.member_role='player'
 ORDER BY c.created_at DESC,c.id LIMIT 100
$$;
REVOKE ALL ON FUNCTION hollowgate_vtt.list_joined_player_campaigns(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.list_joined_player_campaigns(uuid)
 TO hollowgate_api_runtime;
COMMIT;
