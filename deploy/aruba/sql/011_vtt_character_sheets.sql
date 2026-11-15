-- Reuse original HSC wizard's CharacterSheetData in owner-scoped Aruba storage.
-- Idempotent in staging after 010; no change to identity or Supabase data.
BEGIN;
ALTER TABLE hollowgate_vtt.character_drafts DROP CONSTRAINT IF EXISTS character_drafts_status_check;
ALTER TABLE hollowgate_vtt.character_drafts ADD CONSTRAINT character_drafts_status_check
 CHECK(status IN ('draft','active'));
CREATE OR REPLACE FUNCTION hollowgate_vtt.save_owned_character_sheet(
 p_owner uuid,p_campaign uuid,p_character uuid,p_name text,p_sheet jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
 IF p_owner IS NULL OR p_campaign IS NULL OR p_character IS NULL OR p_name IS NULL
 OR length(btrim(p_name)) NOT BETWEEN 1 AND 120
 OR p_sheet IS NULL OR jsonb_typeof(p_sheet)<>'object'
 OR octet_length(p_sheet::text)>32768
 OR NOT (p_sheet ? 'style' AND p_sheet ? 'viaggio'
          AND p_sheet ? 'ambiti' AND p_sheet ? 'abilita'
          AND p_sheet ? 'tratti' AND p_sheet ? 'equipment') THEN
  RAISE EXCEPTION 'Invalid character sheet' USING ERRCODE='22023';
 END IF;
 UPDATE hollowgate_vtt.character_drafts d
 SET name=btrim(p_name),sheet_data=p_sheet,status='active',updated_at=now()
 FROM hollowgate_vtt.campaigns c,hollowgate_auth.users u
 WHERE d.id=p_character AND d.campaign_id=p_campaign AND d.owner_id=p_owner
 AND c.id=d.campaign_id AND c.owner_id=p_owner
 AND u.id=p_owner AND u.status='active' AND u.email_verified_at IS NOT NULL
 RETURNING d.id INTO v_id;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION hollowgate_vtt.save_owned_character_sheet(uuid,uuid,uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.save_owned_character_sheet(uuid,uuid,uuid,text,jsonb) TO hollowgate_api_runtime;
COMMIT;
