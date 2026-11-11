-- Archive (never hard-delete) owned character records. Reversible in the DB.
-- Only on isolated staging. Existing full CharacterSheetData survives archive.
BEGIN;
ALTER TABLE hollowgate_vtt.character_drafts
 DROP CONSTRAINT IF EXISTS character_drafts_status_check;
ALTER TABLE hollowgate_vtt.character_drafts
 ADD CONSTRAINT character_drafts_status_check CHECK (status IN ('draft','active','archived'));
CREATE OR REPLACE FUNCTION hollowgate_vtt.list_character_drafts(p_owner uuid,p_campaign uuid)
RETURNS TABLE(id uuid,campaign_id uuid,owner_id uuid,name text,sheet_data jsonb,status text,created_at timestamptz,updated_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT d.id,d.campaign_id,d.owner_id,d.name,d.sheet_data,d.status,d.created_at,d.updated_at
 FROM hollowgate_vtt.character_drafts d
 JOIN hollowgate_vtt.campaigns c ON c.id=d.campaign_id AND c.owner_id=p_owner
 JOIN hollowgate_auth.users u ON u.id=p_owner
 WHERE d.owner_id=p_owner AND d.campaign_id=p_campaign AND d.status<>'archived'
 AND u.status='active' AND u.email_verified_at IS NOT NULL
 ORDER BY d.created_at DESC,d.id LIMIT 100
$$;
CREATE OR REPLACE FUNCTION hollowgate_vtt.archive_owned_character(
 p_owner uuid,p_campaign uuid,p_character uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
 UPDATE hollowgate_vtt.character_drafts d
 SET status='archived',updated_at=now()
 FROM hollowgate_vtt.campaigns c,hollowgate_auth.users u
 WHERE d.id=p_character AND d.campaign_id=p_campaign AND d.owner_id=p_owner
 AND d.status<>'archived' AND c.id=d.campaign_id AND c.owner_id=p_owner
 AND u.id=p_owner AND u.status='active' AND u.email_verified_at IS NOT NULL
 RETURNING d.id INTO v_id;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION hollowgate_vtt.list_character_drafts(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.archive_owned_character(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.list_character_drafts(uuid,uuid) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.archive_owned_character(uuid,uuid,uuid) TO hollowgate_api_runtime;
COMMIT;
