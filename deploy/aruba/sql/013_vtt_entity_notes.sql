-- Staging-only native character notes; isolated from character sheet JSON and Supabase.
-- Initial safe subset of original entity_notes: ordered character tabs and JSON TipTap.
BEGIN;
CREATE TABLE IF NOT EXISTS hollowgate_vtt.entity_notes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 campaign_id uuid NOT NULL REFERENCES hollowgate_vtt.campaigns(id) ON DELETE RESTRICT,
 character_id uuid NOT NULL REFERENCES hollowgate_vtt.character_drafts(id) ON DELETE RESTRICT,
 owner_id uuid NOT NULL REFERENCES hollowgate_auth.users(id) ON DELETE RESTRICT,
 tab_name text NOT NULL CHECK(length(btrim(tab_name)) BETWEEN 1 AND 120),
 content text NOT NULL DEFAULT '' CHECK(octet_length(content)<=32768),
 content_rich jsonb CHECK(content_rich IS NULL OR (jsonb_typeof(content_rich)='object' AND octet_length(content_rich::text)<=49152)),
 position integer NOT NULL DEFAULT 0 CHECK(position BETWEEN 0 AND 10000),
 hidden boolean NOT NULL DEFAULT false,
 visibility text NOT NULL DEFAULT 'all' CHECK(visibility IN ('all','private')),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS entity_notes_owner_campaign_character_idx
 ON hollowgate_vtt.entity_notes(owner_id,campaign_id,character_id,position,id);
REVOKE ALL ON hollowgate_vtt.entity_notes FROM PUBLIC,hollowgate_api_runtime;

CREATE OR REPLACE FUNCTION hollowgate_vtt.list_owned_character_notes(
 p_owner uuid,p_campaign uuid,p_character uuid)
RETURNS TABLE(id uuid,tab_name text,content text,content_rich jsonb,tab_position integer,
 hidden boolean,visibility text,created_at timestamptz,updated_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT n.id,n.tab_name,n.content,n.content_rich,n.position,n.hidden,n.visibility,n.created_at,n.updated_at
 FROM hollowgate_vtt.entity_notes n
 JOIN hollowgate_vtt.character_drafts d ON d.id=n.character_id
 JOIN hollowgate_vtt.campaigns c ON c.id=d.campaign_id AND c.owner_id=p_owner
 JOIN hollowgate_auth.users u ON u.id=p_owner
 WHERE n.owner_id=p_owner AND n.campaign_id=p_campaign AND n.character_id=p_character
  AND n.status='active' AND d.owner_id=p_owner AND d.campaign_id=p_campaign
  AND d.status='active' AND u.status='active' AND u.email_verified_at IS NOT NULL
 ORDER BY n.position,n.created_at,n.id LIMIT 100
$$;

CREATE OR REPLACE FUNCTION hollowgate_vtt.create_owned_character_note(
 p_owner uuid,p_campaign uuid,p_character uuid,p_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_id uuid;v_position integer;
BEGIN
 IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 120 THEN
  RAISE EXCEPTION 'Invalid note title' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS (
  SELECT 1 FROM hollowgate_vtt.character_drafts d
  JOIN hollowgate_vtt.campaigns c ON c.id=d.campaign_id AND c.owner_id=p_owner
  JOIN hollowgate_auth.users u ON u.id=p_owner
  WHERE d.id=p_character AND d.owner_id=p_owner AND d.campaign_id=p_campaign
   AND d.status='active' AND u.status='active' AND u.email_verified_at IS NOT NULL
 ) THEN RETURN NULL;END IF;
 SELECT count(*)::integer INTO v_position FROM hollowgate_vtt.entity_notes
 WHERE owner_id=p_owner AND campaign_id=p_campaign AND character_id=p_character AND status='active';
 IF v_position>=100 THEN RAISE EXCEPTION 'Too many notes' USING ERRCODE='22023';END IF;
 INSERT INTO hollowgate_vtt.entity_notes(owner_id,campaign_id,character_id,tab_name,position)
 VALUES(p_owner,p_campaign,p_character,btrim(p_name),v_position)
 RETURNING id INTO v_id;
 RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION hollowgate_vtt.save_owned_character_note(
 p_owner uuid,p_campaign uuid,p_character uuid,p_note uuid,p_name text,
 p_content text,p_rich jsonb,p_position integer,p_hidden boolean,p_visibility text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
 IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 120
  OR p_content IS NULL OR octet_length(p_content)>32768
  OR (p_rich IS NOT NULL AND (jsonb_typeof(p_rich)<>'object' OR octet_length(p_rich::text)>49152))
  OR p_position NOT BETWEEN 0 AND 10000 OR p_hidden IS NULL
  OR p_visibility NOT IN ('all','private') THEN
  RAISE EXCEPTION 'Invalid note' USING ERRCODE='22023';
 END IF;
 UPDATE hollowgate_vtt.entity_notes n
 SET tab_name=btrim(p_name),content=p_content,content_rich=p_rich,
 position=p_position,hidden=p_hidden,visibility=p_visibility,updated_at=now()
 FROM hollowgate_vtt.character_drafts d,hollowgate_vtt.campaigns c,hollowgate_auth.users u
 WHERE n.id=p_note AND n.owner_id=p_owner AND n.campaign_id=p_campaign
  AND n.character_id=p_character AND n.status='active'
  AND d.id=n.character_id AND d.owner_id=p_owner AND d.campaign_id=p_campaign
  AND d.status='active' AND c.id=d.campaign_id AND c.owner_id=p_owner
  AND u.id=p_owner AND u.status='active' AND u.email_verified_at IS NOT NULL
 RETURNING n.id INTO v_id;
 RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION hollowgate_vtt.archive_owned_character_note(
 p_owner uuid,p_campaign uuid,p_character uuid,p_note uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
 UPDATE hollowgate_vtt.entity_notes n
 SET status='archived',updated_at=now()
 FROM hollowgate_vtt.character_drafts d,hollowgate_vtt.campaigns c,hollowgate_auth.users u
 WHERE n.id=p_note AND n.owner_id=p_owner AND n.campaign_id=p_campaign
  AND n.character_id=p_character AND n.status='active'
  AND d.id=n.character_id AND d.owner_id=p_owner AND d.campaign_id=p_campaign
  AND d.status='active' AND c.id=d.campaign_id AND c.owner_id=p_owner
  AND u.id=p_owner AND u.status='active' AND u.email_verified_at IS NOT NULL
 RETURNING n.id INTO v_id;
 RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION hollowgate_vtt.list_owned_character_notes(uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.create_owned_character_note(uuid,uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.save_owned_character_note(uuid,uuid,uuid,uuid,text,text,jsonb,integer,boolean,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.archive_owned_character_note(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.list_owned_character_notes(uuid,uuid,uuid) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.create_owned_character_note(uuid,uuid,uuid,text) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.save_owned_character_note(uuid,uuid,uuid,uuid,text,text,jsonb,integer,boolean,text) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.archive_owned_character_note(uuid,uuid,uuid,uuid) TO hollowgate_api_runtime;
COMMIT;
