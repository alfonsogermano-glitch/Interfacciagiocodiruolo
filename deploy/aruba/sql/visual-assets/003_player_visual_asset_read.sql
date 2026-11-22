BEGIN;
-- Player-scoped visual asset reads. An assigned player may read ONLY the
-- binary assets currently referenced by their own authorized character sheet:
-- portrait frame id, cover frame id, or the exact same-campaign cover content
-- URL. Owner list/save/remove remain untouched and owner-only.
CREATE OR REPLACE FUNCTION hollowgate_vtt.player_visual_asset_referenced(
 p_player uuid,p_campaign uuid,p_asset uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT EXISTS(
  SELECT 1
  FROM hollowgate_vtt.character_player_assignments a
  JOIN hollowgate_vtt.character_drafts d ON d.id=a.character_id
   AND d.campaign_id=a.campaign_id AND d.status='active'
   AND d.available_for_players=true
  JOIN hollowgate_vtt.campaigns c ON c.id=d.campaign_id AND c.owner_id=d.owner_id
  JOIN hollowgate_auth.users owner_u ON owner_u.id=c.owner_id
   AND owner_u.status='active' AND owner_u.email_verified_at IS NOT NULL
  JOIN hollowgate_vtt.campaign_members m ON m.campaign_id=a.campaign_id
   AND m.user_id=a.player_id AND m.status='active' AND m.member_role='player'
  JOIN hollowgate_auth.users player_u ON player_u.id=m.user_id
   AND player_u.status='active' AND player_u.email_verified_at IS NOT NULL
  CROSS JOIN LATERAL (
   VALUES
    (NULLIF(btrim(d.sheet_data->>'portraitFrameAssetId'),'')),
    (NULLIF(btrim(d.sheet_data->>'coverFrameAssetId'),'')),
    (CASE WHEN split_part(d.sheet_data->>'coverImageUrl','/',1)=''
       AND split_part(d.sheet_data->>'coverImageUrl','/',2)='vtt'
       AND split_part(d.sheet_data->>'coverImageUrl','/',3)='campaigns'
       AND lower(split_part(d.sheet_data->>'coverImageUrl','/',4))=lower(p_campaign::text)
       AND split_part(d.sheet_data->>'coverImageUrl','/',5)='visual-assets'
       AND split_part(d.sheet_data->>'coverImageUrl','/',7)='content'
      THEN split_part(d.sheet_data->>'coverImageUrl','/',6) END)
  ) r(asset_id)
  WHERE a.player_id=p_player AND a.campaign_id=p_campaign
   AND lower(r.asset_id)=lower(p_asset::text)
 )
$$;

CREATE OR REPLACE FUNCTION hollowgate_vtt.list_assigned_player_visual_assets(
 p_player uuid,p_campaign uuid)
RETURNS TABLE(id uuid,campaign_id uuid,name text,asset_type text,
 thumbnail_mime text,thumbnail_data bytea,created_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 WITH assigned AS (
  SELECT d.sheet_data
  FROM hollowgate_vtt.character_player_assignments a
  JOIN hollowgate_vtt.character_drafts d ON d.id=a.character_id
   AND d.campaign_id=a.campaign_id AND d.status='active'
   AND d.available_for_players=true
  JOIN hollowgate_vtt.campaigns c ON c.id=d.campaign_id AND c.owner_id=d.owner_id
  JOIN hollowgate_auth.users owner_u ON owner_u.id=c.owner_id
   AND owner_u.status='active' AND owner_u.email_verified_at IS NOT NULL
  JOIN hollowgate_vtt.campaign_members m ON m.campaign_id=a.campaign_id
   AND m.user_id=a.player_id AND m.status='active' AND m.member_role='player'
  JOIN hollowgate_auth.users player_u ON player_u.id=m.user_id
   AND player_u.status='active' AND player_u.email_verified_at IS NOT NULL
  WHERE a.player_id=p_player AND a.campaign_id=p_campaign
 ), refs AS (
  SELECT DISTINCT lower(r.asset_id) AS asset_id
  FROM assigned
  CROSS JOIN LATERAL (
   VALUES
    (NULLIF(btrim(sheet_data->>'portraitFrameAssetId'),'')),
    (NULLIF(btrim(sheet_data->>'coverFrameAssetId'),'')),
    (CASE WHEN split_part(sheet_data->>'coverImageUrl','/',1)=''
       AND split_part(sheet_data->>'coverImageUrl','/',2)='vtt'
       AND split_part(sheet_data->>'coverImageUrl','/',3)='campaigns'
       AND lower(split_part(sheet_data->>'coverImageUrl','/',4))=lower(p_campaign::text)
       AND split_part(sheet_data->>'coverImageUrl','/',5)='visual-assets'
       AND split_part(sheet_data->>'coverImageUrl','/',7)='content'
      THEN split_part(sheet_data->>'coverImageUrl','/',6) END)
  ) r(asset_id)
  WHERE r.asset_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 )
 SELECT a.id,a.campaign_id,a.name,a.asset_type,
  a.thumbnail_mime,a.thumbnail_data,a.created_at
 FROM hollowgate_vtt.visual_assets a
 JOIN refs r ON r.asset_id=lower(a.id::text)
 WHERE a.campaign_id=p_campaign
 ORDER BY a.name,a.id LIMIT 1000
$$;

-- One content endpoint for owner and assigned player. The function never
-- exposes rows from another campaign and never trusts browser-supplied roles.
CREATE OR REPLACE FUNCTION hollowgate_vtt.read_authorized_visual_asset(
 p_user uuid,p_campaign uuid,p_id uuid)
RETURNS TABLE(mime_type text,source_data bytea)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT a.source_mime,a.source_data
 FROM hollowgate_vtt.visual_assets a
 WHERE a.id=p_id AND a.campaign_id=p_campaign
   AND (hollowgate_vtt.visual_asset_owner_authorized(p_user,p_campaign)
    OR hollowgate_vtt.player_visual_asset_referenced(p_user,p_campaign,p_id))
$$;

REVOKE ALL ON FUNCTION
 hollowgate_vtt.player_visual_asset_referenced(uuid,uuid,uuid),
 hollowgate_vtt.list_assigned_player_visual_assets(uuid,uuid),
 hollowgate_vtt.read_authorized_visual_asset(uuid,uuid,uuid)
 FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
 hollowgate_vtt.list_assigned_player_visual_assets(uuid,uuid),
 hollowgate_vtt.read_authorized_visual_asset(uuid,uuid,uuid)
 TO hollowgate_api_runtime;
COMMIT;
