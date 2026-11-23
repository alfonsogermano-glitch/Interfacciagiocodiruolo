-- 003: copy native unassigned catalog entries to a campaign (PG/PNG/Monsters).
-- LOCAL/UNRELEASED. No historical backfill, no claim/release semantics.
-- Applies only to catalog_entities rows with campaign_id IS NULL.
-- A copy preserves media, notes (roots + sub-tabs, structural order remapped)
-- and creates the target row with campaign_id set. Source row is untouched.
-- Single transaction: entity, media and notes all succeed or all roll back.
BEGIN;
CREATE FUNCTION hollowgate_vtt.copy_unassigned_catalog_to_campaign(
 p_actor uuid,p_kind text,p_id uuid,p_target_campaign uuid,p_revision integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 DECLARE v_source hollowgate_vtt.catalog_entities;v_copy hollowgate_vtt.catalog_entities;
  v_ids jsonb;v_roots jsonb;v_data jsonb;
 BEGIN
  IF NOT hollowgate_vtt.catalog_actor_active(p_actor) THEN RETURN NULL;END IF;
  IF p_target_campaign IS NULL THEN RETURN NULL;END IF;
  IF NOT EXISTS(SELECT 1 FROM hollowgate_vtt.campaigns c WHERE c.id=p_target_campaign)
  THEN RETURN NULL;END IF;
  SELECT * INTO v_source FROM hollowgate_vtt.catalog_entities e
   WHERE e.kind=p_kind AND e.id=p_id AND e.owner_id=p_actor AND e.campaign_id IS NULL
   AND hollowgate_vtt.catalog_actor_active(p_actor) FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL;END IF;
  IF p_revision IS DISTINCT FROM v_source.revision THEN
   RAISE EXCEPTION 'Catalog revision conflict' USING ERRCODE='40001';END IF;
  IF (SELECT count(*) FROM hollowgate_vtt.catalog_entity_notes WHERE kind=p_kind AND entity_id=p_id AND status='active')>1000
  OR EXISTS(SELECT 1 FROM hollowgate_vtt.catalog_entity_notes n LEFT JOIN hollowgate_vtt.catalog_entity_notes parent ON parent.id=n.parent_note_id
   WHERE n.kind=p_kind AND n.entity_id=p_id AND n.status='active' AND n.parent_note_id IS NOT NULL
    AND (parent.id IS NULL OR parent.status<>'active' OR parent.parent_note_id IS NOT NULL OR parent.kind<>p_kind OR parent.entity_id<>p_id))
  THEN RAISE EXCEPTION 'Invalid catalog note graph' USING ERRCODE='22023';END IF;
  SELECT coalesce(jsonb_object_agg(id::text,gen_random_uuid()::text),'{}'::jsonb) INTO v_ids
  FROM hollowgate_vtt.catalog_entity_notes WHERE kind=p_kind AND entity_id=p_id AND status='active';
  SELECT coalesce(jsonb_object_agg(id::text,v_ids->id::text),'{}'::jsonb) INTO v_roots
  FROM hollowgate_vtt.catalog_entity_notes WHERE kind=p_kind AND entity_id=p_id AND status='active' AND parent_note_id IS NULL;
  v_data:=v_source.data;
  IF v_data ? 'tabOrder' THEN v_data:=jsonb_set(v_data,'{tabOrder}',coalesce(hollowgate_vtt.remap_catalog_tab_order(v_data->'tabOrder',v_roots),'null'::jsonb));END IF;
  INSERT INTO hollowgate_vtt.catalog_entities(kind,owner_id,name,ruleset,data,campaign_id)
  VALUES(p_kind,p_actor,v_source.name,v_source.ruleset,v_data,p_target_campaign) RETURNING * INTO v_copy;
  INSERT INTO hollowgate_vtt.catalog_entity_media(kind,entity_id,role,mime_type,bytes)
  SELECT kind,v_copy.id,role,mime_type,bytes FROM hollowgate_vtt.catalog_entity_media WHERE kind=p_kind AND entity_id=p_id;
  -- Parents first, then children, so scoped FK and two-level trigger both hold.
  INSERT INTO hollowgate_vtt.catalog_entity_notes(id,kind,entity_id,created_by,tab_name,content,content_rich,position,hidden,visibility,tab_order)
  SELECT (v_ids->>n.id::text)::uuid,p_kind,v_copy.id,p_actor,n.tab_name,n.content,n.content_rich,n.position,n.hidden,n.visibility,
   hollowgate_vtt.remap_catalog_tab_order(n.tab_order,coalesce((SELECT jsonb_object_agg(child.id::text,v_ids->child.id::text)
    FROM hollowgate_vtt.catalog_entity_notes child WHERE child.kind=p_kind AND child.entity_id=p_id
     AND child.parent_note_id=n.id AND child.status='active'),'{}'::jsonb))
  FROM hollowgate_vtt.catalog_entity_notes n WHERE n.kind=p_kind AND n.entity_id=p_id AND n.status='active' AND n.parent_note_id IS NULL;
  INSERT INTO hollowgate_vtt.catalog_entity_notes(id,kind,entity_id,parent_note_id,created_by,tab_name,content,content_rich,position,hidden,visibility)
  SELECT (v_ids->>n.id::text)::uuid,p_kind,v_copy.id,(v_ids->>n.parent_note_id::text)::uuid,p_actor,n.tab_name,n.content,n.content_rich,n.position,n.hidden,n.visibility
  FROM hollowgate_vtt.catalog_entity_notes n WHERE n.kind=p_kind AND n.entity_id=p_id AND n.status='active' AND n.parent_note_id IS NOT NULL;
  RETURN hollowgate_vtt.catalog_entity_document(v_copy);
 EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Catalog copy conflict' USING ERRCODE='40001';
 END $$;
REVOKE ALL ON FUNCTION hollowgate_vtt.copy_unassigned_catalog_to_campaign(uuid,text,uuid,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.copy_unassigned_catalog_to_campaign(uuid,text,uuid,uuid,integer) TO hollowgate_api_runtime;
COMMIT;
