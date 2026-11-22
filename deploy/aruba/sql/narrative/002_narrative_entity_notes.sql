-- Original custom tabs for Aruba-native PNG and Monster documents.
-- Separate from character notes: no forged character FK or shared identity.
BEGIN;
CREATE TABLE hollowgate_vtt.narrative_entity_notes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 campaign_id uuid NOT NULL REFERENCES hollowgate_vtt.campaigns(id) ON DELETE RESTRICT,
 kind text NOT NULL CHECK(kind IN('npcs','monsters')),
 entity_id uuid NOT NULL,
 owner_id uuid NOT NULL REFERENCES hollowgate_auth.users(id) ON DELETE RESTRICT,
 parent_note_id uuid REFERENCES hollowgate_vtt.narrative_entity_notes(id) ON DELETE RESTRICT,
 tab_name text NOT NULL CHECK(length(btrim(tab_name)) BETWEEN 1 AND 120),
 content text NOT NULL DEFAULT '' CHECK(octet_length(content)<=32768),
 content_rich jsonb CHECK(content_rich IS NULL OR(jsonb_typeof(content_rich)='object' AND octet_length(content_rich::text)<=1048576)),
 position integer NOT NULL DEFAULT 0 CHECK(position BETWEEN 0 AND 10000),
 hidden boolean NOT NULL DEFAULT false,
 visibility text NOT NULL DEFAULT 'all' CHECK(visibility IN('all','private')),
 tab_order jsonb CHECK(tab_order IS NULL OR jsonb_typeof(tab_order)='array'),
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','archived')),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,campaign_id,kind,entity_id)
);
CREATE INDEX narrative_entity_notes_scope_idx ON hollowgate_vtt.narrative_entity_notes(campaign_id,kind,entity_id,parent_note_id,position);
REVOKE ALL ON hollowgate_vtt.narrative_entity_notes FROM PUBLIC,hollowgate_api_runtime;

CREATE FUNCTION hollowgate_vtt.narrative_note_owner_authorized(p_owner uuid,p_campaign uuid,p_kind text,p_entity uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT hollowgate_vtt.narrative_content_owner_authorized(p_owner,p_campaign) AND EXISTS(
  SELECT 1 FROM hollowgate_vtt.narrative_content_documents d
  WHERE d.id=p_entity AND d.campaign_id=p_campaign AND d.kind=p_kind AND p_kind IN('npcs','monsters'))
$$;
CREATE FUNCTION hollowgate_vtt.list_owned_narrative_entity_notes(p_owner uuid,p_campaign uuid,p_kind text,p_entity uuid,p_parent uuid)
RETURNS TABLE(id uuid,tab_name text,content text,content_rich jsonb,tab_position integer,hidden boolean,visibility text,
 parent_note_id uuid,tab_order jsonb,created_at timestamptz,updated_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT n.id,n.tab_name,n.content,n.content_rich,n.position,n.hidden,n.visibility,n.parent_note_id,n.tab_order,n.created_at,n.updated_at
 FROM hollowgate_vtt.narrative_entity_notes n
 WHERE n.owner_id=p_owner AND n.campaign_id=p_campaign AND n.kind=p_kind AND n.entity_id=p_entity
  AND n.parent_note_id IS NOT DISTINCT FROM p_parent AND n.status='active'
  AND hollowgate_vtt.narrative_note_owner_authorized(p_owner,p_campaign,p_kind,p_entity)
 ORDER BY n.position,n.created_at,n.id LIMIT 100
$$;
CREATE FUNCTION hollowgate_vtt.create_owned_narrative_entity_note(p_owner uuid,p_campaign uuid,p_kind text,p_entity uuid,p_name text,p_parent uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_id uuid;v_position integer;
BEGIN
 IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 120 OR
  NOT hollowgate_vtt.narrative_note_owner_authorized(p_owner,p_campaign,p_kind,p_entity) THEN RETURN NULL;END IF;
 IF p_parent IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hollowgate_vtt.narrative_entity_notes n
  WHERE n.id=p_parent AND n.owner_id=p_owner AND n.campaign_id=p_campaign AND n.kind=p_kind AND n.entity_id=p_entity
   AND n.parent_note_id IS NULL AND n.status='active') THEN RETURN NULL;END IF;
 SELECT count(*)::integer INTO v_position FROM hollowgate_vtt.narrative_entity_notes n
 WHERE n.owner_id=p_owner AND n.campaign_id=p_campaign AND n.kind=p_kind AND n.entity_id=p_entity
  AND n.parent_note_id IS NOT DISTINCT FROM p_parent AND n.status='active';
 IF v_position>=100 THEN RETURN NULL;END IF;
 INSERT INTO hollowgate_vtt.narrative_entity_notes(campaign_id,kind,entity_id,owner_id,parent_note_id,tab_name,position)
 VALUES(p_campaign,p_kind,p_entity,p_owner,p_parent,btrim(p_name),v_position) RETURNING id INTO v_id;RETURN v_id;
END $$;
CREATE FUNCTION hollowgate_vtt.save_owned_narrative_entity_note(p_owner uuid,p_campaign uuid,p_kind text,p_entity uuid,p_note uuid,
 p_name text,p_content text,p_rich jsonb,p_position integer,p_hidden boolean,p_visibility text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_id uuid;BEGIN
 IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 120 OR p_content IS NULL OR octet_length(p_content)>32768
   OR(p_rich IS NOT NULL AND(jsonb_typeof(p_rich)<>'object' OR octet_length(p_rich::text)>1048576))
  OR p_position NOT BETWEEN 0 AND 10000 OR p_hidden IS NULL OR p_visibility NOT IN('all','private')
  OR NOT hollowgate_vtt.narrative_note_owner_authorized(p_owner,p_campaign,p_kind,p_entity) THEN RETURN NULL;END IF;
 UPDATE hollowgate_vtt.narrative_entity_notes SET tab_name=btrim(p_name),content=p_content,content_rich=p_rich,
  position=p_position,hidden=p_hidden,visibility=p_visibility,updated_at=now()
 WHERE id=p_note AND owner_id=p_owner AND campaign_id=p_campaign AND kind=p_kind AND entity_id=p_entity AND status='active'
 RETURNING id INTO v_id;RETURN v_id;
END $$;
CREATE FUNCTION hollowgate_vtt.archive_owned_narrative_entity_note(p_owner uuid,p_campaign uuid,p_kind text,p_entity uuid,p_note uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_id uuid;BEGIN
 IF NOT hollowgate_vtt.narrative_note_owner_authorized(p_owner,p_campaign,p_kind,p_entity) THEN RETURN NULL;END IF;
 UPDATE hollowgate_vtt.narrative_entity_notes SET status='archived',updated_at=now()
 WHERE owner_id=p_owner AND campaign_id=p_campaign AND kind=p_kind AND entity_id=p_entity
  AND status='active' AND(id=p_note OR parent_note_id=p_note);
 SELECT id INTO v_id FROM hollowgate_vtt.narrative_entity_notes WHERE id=p_note AND owner_id=p_owner
  AND campaign_id=p_campaign AND kind=p_kind AND entity_id=p_entity AND status='archived';RETURN v_id;
END $$;
CREATE FUNCTION hollowgate_vtt.set_owned_narrative_note_subtab_order(p_owner uuid,p_campaign uuid,p_kind text,p_entity uuid,p_parent uuid,p_order jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_id uuid;BEGIN
 IF p_order IS NULL OR jsonb_typeof(p_order)<>'array' OR jsonb_array_length(p_order)>100
  OR NOT hollowgate_vtt.narrative_note_owner_authorized(p_owner,p_campaign,p_kind,p_entity) THEN RETURN NULL;END IF;
 IF(SELECT count(*) FROM jsonb_array_elements_text(p_order))<>(SELECT count(DISTINCT value) FROM jsonb_array_elements_text(p_order))
  OR(SELECT count(*) FROM jsonb_array_elements_text(p_order))<>(SELECT count(*) FROM hollowgate_vtt.narrative_entity_notes n
   WHERE n.parent_note_id=p_parent AND n.owner_id=p_owner AND n.campaign_id=p_campaign AND n.kind=p_kind AND n.entity_id=p_entity AND n.status='active')
  OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_order) x(value) WHERE value!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR NOT EXISTS(
   SELECT 1 FROM hollowgate_vtt.narrative_entity_notes n WHERE n.id=CASE WHEN value~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN value::uuid ELSE NULL END AND n.parent_note_id=p_parent
    AND n.owner_id=p_owner AND n.campaign_id=p_campaign AND n.kind=p_kind AND n.entity_id=p_entity AND n.status='active'))
 THEN RETURN NULL;END IF;
 UPDATE hollowgate_vtt.narrative_entity_notes SET tab_order=p_order,updated_at=now()
 WHERE id=p_parent AND owner_id=p_owner AND campaign_id=p_campaign AND kind=p_kind AND entity_id=p_entity
  AND parent_note_id IS NULL AND status='active' RETURNING id INTO v_id;RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION hollowgate_vtt.narrative_note_owner_authorized(uuid,uuid,text,uuid),
 hollowgate_vtt.list_owned_narrative_entity_notes(uuid,uuid,text,uuid,uuid),
 hollowgate_vtt.create_owned_narrative_entity_note(uuid,uuid,text,uuid,text,uuid),
 hollowgate_vtt.save_owned_narrative_entity_note(uuid,uuid,text,uuid,uuid,text,text,jsonb,integer,boolean,text),
 hollowgate_vtt.archive_owned_narrative_entity_note(uuid,uuid,text,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.set_owned_narrative_note_subtab_order(uuid,uuid,text,uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.narrative_note_owner_authorized(uuid,uuid,text,uuid),
 hollowgate_vtt.list_owned_narrative_entity_notes(uuid,uuid,text,uuid,uuid),
 hollowgate_vtt.create_owned_narrative_entity_note(uuid,uuid,text,uuid,text,uuid),
 hollowgate_vtt.save_owned_narrative_entity_note(uuid,uuid,text,uuid,uuid,text,text,jsonb,integer,boolean,text),
 hollowgate_vtt.archive_owned_narrative_entity_note(uuid,uuid,text,uuid,uuid) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.set_owned_narrative_note_subtab_order(uuid,uuid,text,uuid,uuid,jsonb) TO hollowgate_api_runtime;
COMMIT;
