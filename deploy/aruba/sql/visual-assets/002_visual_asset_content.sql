BEGIN;
-- Owner-read of the full source image for frame overlays and cover previews.
-- Only the campaign owner can read content; the API never exposes the table.
CREATE OR REPLACE FUNCTION hollowgate_vtt.read_owned_visual_asset(p_owner uuid,p_campaign uuid,p_id uuid)
RETURNS TABLE(mime_type text,source_data bytea)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT a.source_mime,a.source_data
 FROM hollowgate_vtt.visual_assets a
 WHERE a.id=p_id AND a.campaign_id=p_campaign
   AND hollowgate_vtt.visual_asset_owner_authorized(p_owner,p_campaign)
$$;
REVOKE ALL ON FUNCTION hollowgate_vtt.read_owned_visual_asset(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.read_owned_visual_asset(uuid,uuid,uuid) TO hollowgate_api_runtime;
COMMIT;
