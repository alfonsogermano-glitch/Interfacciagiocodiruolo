-- First Aruba-native character storage: HSC and other rulesets use their original
-- flexible CharacterSheetData (sheet_data jsonb), no Supabase ids or passwords.
-- Draft only: do not claim full legacy wizard has been migrated.
BEGIN;
CREATE TABLE IF NOT EXISTS hollowgate_vtt.character_drafts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 campaign_id uuid NOT NULL REFERENCES hollowgate_vtt.campaigns(id) ON DELETE RESTRICT,
 owner_id uuid NOT NULL REFERENCES hollowgate_auth.users(id) ON DELETE RESTRICT,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 120),
 sheet_data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(sheet_data)='object'),
 status text NOT NULL DEFAULT 'draft' CHECK(status='draft'),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS character_drafts_owner_campaign_idx
 ON hollowgate_vtt.character_drafts(owner_id,campaign_id,created_at DESC);
REVOKE ALL ON hollowgate_vtt.character_drafts FROM PUBLIC,hollowgate_api_runtime;

-- Atomic owner + campaign checks: no runtime table privileges.
CREATE OR REPLACE FUNCTION hollowgate_vtt.list_character_drafts(p_owner uuid,p_campaign uuid)
RETURNS TABLE(id uuid,campaign_id uuid,owner_id uuid,name text,sheet_data jsonb,status text,created_at timestamptz,updated_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT d.id,d.campaign_id,d.owner_id,d.name,d.sheet_data,d.status,d.created_at,d.updated_at
 FROM hollowgate_vtt.character_drafts d
 JOIN hollowgate_vtt.campaigns c ON c.id=d.campaign_id AND c.owner_id=p_owner
 JOIN hollowgate_auth.users u ON u.id=p_owner
 WHERE d.owner_id=p_owner AND d.campaign_id=p_campaign
   AND u.status='active' AND u.email_verified_at IS NOT NULL
 ORDER BY d.created_at DESC,d.id
 LIMIT 100
$$;
CREATE OR REPLACE FUNCTION hollowgate_vtt.create_character_draft(p_owner uuid,p_campaign uuid,p_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
 IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 120 THEN
  RAISE EXCEPTION 'Invalid character name' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS(
  SELECT 1 FROM hollowgate_vtt.campaigns c JOIN hollowgate_auth.users u ON u.id=c.owner_id
  WHERE c.id=p_campaign AND c.owner_id=p_owner AND u.status='active' AND u.email_verified_at IS NOT NULL
 ) THEN RETURN NULL; END IF;
 INSERT INTO hollowgate_vtt.character_drafts(campaign_id,owner_id,name)
 VALUES(p_campaign,p_owner,btrim(p_name)) RETURNING id INTO v_id;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION hollowgate_vtt.list_character_drafts(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.create_character_draft(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.list_character_drafts(uuid,uuid) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.create_character_draft(uuid,uuid,text) TO hollowgate_api_runtime;
COMMIT;
