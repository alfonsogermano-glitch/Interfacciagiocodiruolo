-- Original Hollowgate NoteSubTabs: exactly TWO levels, child notes belong to
-- a single active parent in the same owned campaign/character.
-- Additive staging schema: no existing note text or rich document is changed.
BEGIN;
ALTER TABLE hollowgate_vtt.entity_notes
 ADD COLUMN IF NOT EXISTS parent_note_id uuid REFERENCES hollowgate_vtt.entity_notes(id) ON DELETE RESTRICT;
ALTER TABLE hollowgate_vtt.entity_notes
 ADD COLUMN IF NOT EXISTS tab_order jsonb;
ALTER TABLE hollowgate_vtt.entity_notes
 DROP CONSTRAINT IF EXISTS entity_notes_tab_order_valid;
ALTER TABLE hollowgate_vtt.entity_notes
 ADD CONSTRAINT entity_notes_tab_order_valid
 CHECK(tab_order IS NULL OR (jsonb_typeof(tab_order)='array' AND octet_length(tab_order::text)<=4100));
CREATE INDEX IF NOT EXISTS entity_notes_parent_scope_idx
 ON hollowgate_vtt.entity_notes(owner_id,campaign_id,character_id,parent_note_id,status,position);

CREATE OR REPLACE FUNCTION hollowgate_vtt.list_owned_character_notes_v2(
 p_owner uuid,p_campaign uuid,p_character uuid,p_parent uuid DEFAULT NULL)
RETURNS TABLE(id uuid,tab_name text,content text,content_rich jsonb,
 tab_position integer,hidden boolean,visibility text,created_at timestamptz,
 updated_at timestamptz,parent_note_id uuid,tab_order jsonb)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT n.id,n.tab_name,n.content,n.content_rich,n.position,n.hidden,n.visibility,
 n.created_at,n.updated_at,n.parent_note_id,n.tab_order
 FROM hollowgate_vtt.entity_notes n
 JOIN hollowgate_vtt.character_drafts d ON d.id=n.character_id
 JOIN hollowgate_vtt.campaigns c ON c.id=d.campaign_id AND c.owner_id=p_owner
 JOIN hollowgate_auth.users u ON u.id=p_owner
 LEFT JOIN hollowgate_vtt.entity_notes parent ON parent.id=p_parent
 WHERE n.owner_id=p_owner AND n.campaign_id=p_campaign AND n.character_id=p_character
 AND n.status='active' AND n.parent_note_id IS NOT DISTINCT FROM p_parent
 AND d.owner_id=p_owner AND d.campaign_id=p_campaign
 AND d.status='active' AND u.status='active' AND u.email_verified_at IS NOT NULL
 AND (p_parent IS NULL OR (parent.id=p_parent AND parent.parent_note_id IS NULL
  AND parent.owner_id=p_owner AND parent.campaign_id=p_campaign
  AND parent.character_id=p_character AND parent.status='active'))
 ORDER BY n.position,n.created_at,n.id LIMIT 100
$$;

CREATE OR REPLACE FUNCTION hollowgate_vtt.create_owned_character_note_v2(
 p_owner uuid,p_campaign uuid,p_character uuid,p_name text,p_parent uuid DEFAULT NULL)
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
 IF p_parent IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM hollowgate_vtt.entity_notes n
  WHERE n.id=p_parent AND n.owner_id=p_owner AND n.campaign_id=p_campaign
    AND n.character_id=p_character AND n.parent_note_id IS NULL AND n.status='active'
 ) THEN RETURN NULL;END IF;
 SELECT count(*)::integer INTO v_position FROM hollowgate_vtt.entity_notes
 WHERE owner_id=p_owner AND campaign_id=p_campaign AND character_id=p_character
  AND parent_note_id IS NOT DISTINCT FROM p_parent AND status='active';
 IF v_position>=100 THEN RAISE EXCEPTION 'Too many notes' USING ERRCODE='22023';END IF;
 INSERT INTO hollowgate_vtt.entity_notes(owner_id,campaign_id,character_id,tab_name,position,parent_note_id)
 VALUES(p_owner,p_campaign,p_character,btrim(p_name),v_position,p_parent)
 RETURNING id INTO v_id;
 RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION hollowgate_vtt.set_owned_note_subtab_order(
 p_owner uuid,p_campaign uuid,p_character uuid,p_parent uuid,p_order jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_parent uuid;v_count integer;v_distinct integer;v_owned integer;
BEGIN
 IF p_order IS NULL OR jsonb_typeof(p_order)<>'array' OR jsonb_array_length(p_order)>100 THEN
  RAISE EXCEPTION 'Invalid subtab order' USING ERRCODE='22023';
 END IF;
 -- Reject duplicate, malformed or unrelated UUID values before modifying parent.
 SELECT count(*),count(DISTINCT value) INTO v_count,v_distinct
 FROM jsonb_array_elements_text(p_order) AS elem(value)
 WHERE value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
 IF v_count<>jsonb_array_length(p_order) OR v_distinct<>v_count THEN
  RAISE EXCEPTION 'Invalid subtab identifiers' USING ERRCODE='22023';
 END IF;
 SELECT count(*) INTO v_owned FROM hollowgate_vtt.entity_notes n
 WHERE n.owner_id=p_owner AND n.campaign_id=p_campaign AND n.character_id=p_character
  AND n.parent_note_id=p_parent AND n.status='active';
 IF v_owned<>v_count OR EXISTS (
  SELECT 1 FROM jsonb_array_elements_text(p_order) AS elem(value)
  WHERE NOT EXISTS (
   SELECT 1 FROM hollowgate_vtt.entity_notes n
   WHERE n.id=elem.value::uuid AND n.owner_id=p_owner AND n.campaign_id=p_campaign
    AND n.character_id=p_character AND n.parent_note_id=p_parent AND n.status='active'
  )
 ) THEN RETURN NULL;END IF;
 UPDATE hollowgate_vtt.entity_notes n
 SET tab_order=p_order,updated_at=now()
 FROM hollowgate_vtt.character_drafts d,hollowgate_vtt.campaigns c,hollowgate_auth.users u
 WHERE n.id=p_parent AND n.parent_note_id IS NULL AND n.status='active'
  AND n.owner_id=p_owner AND n.campaign_id=p_campaign AND n.character_id=p_character
  AND d.id=n.character_id AND d.owner_id=p_owner AND d.campaign_id=p_campaign
  AND d.status='active' AND c.id=d.campaign_id AND c.owner_id=p_owner
  AND u.id=p_owner AND u.status='active' AND u.email_verified_at IS NOT NULL
 RETURNING n.id INTO v_parent;
 RETURN v_parent;
END $$;

CREATE OR REPLACE FUNCTION hollowgate_vtt.archive_owned_character_note_v2(
 p_owner uuid,p_campaign uuid,p_character uuid,p_note uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
 SELECT hollowgate_vtt.archive_owned_character_note(p_owner,p_campaign,p_character,p_note)
 INTO v_id;
 IF v_id IS NOT NULL THEN
  UPDATE hollowgate_vtt.entity_notes n SET status='archived',updated_at=now()
  WHERE n.owner_id=p_owner AND n.campaign_id=p_campaign AND n.character_id=p_character
   AND n.parent_note_id=v_id AND n.status='active';
 END IF;
 RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION hollowgate_vtt.list_owned_character_notes_v2(uuid,uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.create_owned_character_note_v2(uuid,uuid,uuid,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.set_owned_note_subtab_order(uuid,uuid,uuid,uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.archive_owned_character_note_v2(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.list_owned_character_notes_v2(uuid,uuid,uuid,uuid) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.create_owned_character_note_v2(uuid,uuid,uuid,text,uuid) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.set_owned_note_subtab_order(uuid,uuid,uuid,uuid,jsonb) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.archive_owned_character_note_v2(uuid,uuid,uuid,uuid) TO hollowgate_api_runtime;
COMMIT;
