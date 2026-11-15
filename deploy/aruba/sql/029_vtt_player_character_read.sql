-- 029: read-only assigned character sheets for authenticated players.
-- No direct table access; every read is joined to current campaign membership,
-- assignment, available flag, verified active users and active character status.
BEGIN;
CREATE FUNCTION hollowgate_vtt.list_assigned_player_character_sheets(
 p_player uuid,p_campaign uuid)
RETURNS TABLE(id uuid,campaign_id uuid,owner_id uuid,name text,
 sheet_data jsonb,status text,created_at timestamptz,updated_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT d.id,d.campaign_id,d.owner_id,d.name,d.sheet_data,d.status,d.created_at,d.updated_at
 FROM hollowgate_vtt.character_player_assignments a
 JOIN hollowgate_vtt.character_drafts d ON d.id=a.character_id
  AND d.campaign_id=a.campaign_id AND d.status='active' AND d.available_for_players=true
 JOIN hollowgate_vtt.campaigns c ON c.id=d.campaign_id AND c.owner_id=d.owner_id
 JOIN hollowgate_auth.users owner_u ON owner_u.id=c.owner_id
  AND owner_u.status='active' AND owner_u.email_verified_at IS NOT NULL
 JOIN hollowgate_vtt.campaign_members m ON m.campaign_id=a.campaign_id
  AND m.user_id=a.player_id AND m.status='active' AND m.member_role='player'
 JOIN hollowgate_auth.users player_u ON player_u.id=m.user_id
  AND player_u.status='active' AND player_u.email_verified_at IS NOT NULL
 WHERE a.player_id=p_player AND a.campaign_id=p_campaign
 ORDER BY d.created_at,d.id LIMIT 100
$$;
REVOKE ALL ON FUNCTION hollowgate_vtt.list_assigned_player_character_sheets(uuid,uuid)
 FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.list_assigned_player_character_sheets(uuid,uuid)
 TO hollowgate_api_runtime;
COMMIT;
