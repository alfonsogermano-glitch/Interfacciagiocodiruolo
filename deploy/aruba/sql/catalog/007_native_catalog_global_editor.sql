-- Global editor surface for native entries: owner-wide listing of native
-- entries plus media/notes editing on assigned entries (any campaign).
BEGIN;

CREATE FUNCTION hollowgate_vtt.lock_native_catalog_entry_global(p_actor uuid,p_kind text,p_id uuid,p_revision integer)
RETURNS hollowgate_vtt.catalog_entities LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_entry hollowgate_vtt.catalog_entities;
BEGIN
 SELECT * INTO v_entry FROM hollowgate_vtt.catalog_entities e WHERE e.kind=p_kind AND e.id=p_id
  AND e.owner_id=p_actor AND hollowgate_vtt.catalog_actor_active(p_actor) FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 IF p_revision IS NOT NULL AND p_revision IS DISTINCT FROM v_entry.revision THEN
  RAISE EXCEPTION 'Catalog revision conflict' USING ERRCODE='40001';END IF;
 RETURN v_entry;
END $$;

CREATE FUNCTION hollowgate_vtt.list_native_catalog_entries_global(p_actor uuid,p_kind text,p_after uuid)
RETURNS TABLE(item jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
SELECT hollowgate_vtt.catalog_entity_document(e) FROM hollowgate_vtt.catalog_entities e
WHERE e.kind=p_kind AND e.owner_id=p_actor
  AND (p_after IS NULL OR e.id>p_after) AND hollowgate_vtt.catalog_actor_active(p_actor)
ORDER BY e.id LIMIT 101
$$;

CREATE FUNCTION hollowgate_vtt.save_native_catalog_media_global(p_actor uuid,p_kind text,p_id uuid,
 p_revision integer,p_role text,p_type text,p_bytes bytea)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_entry hollowgate_vtt.catalog_entities;v_signature boolean;
BEGIN
 v_entry:=hollowgate_vtt.lock_native_catalog_entry_global(p_actor,p_kind,p_id,p_revision);
 IF v_entry.id IS NULL THEN RETURN NULL;END IF;
 v_signature:=CASE p_type
  WHEN 'image/png' THEN substring(p_bytes FROM 1 FOR 8)=decode('89504e470d0a1a0a','hex')
  WHEN 'image/jpeg' THEN substring(p_bytes FROM 1 FOR 3)=decode('ffd8ff','hex')
  WHEN 'image/webp' THEN substring(p_bytes FROM 1 FOR 4)=decode('52494646','hex')
   AND substring(p_bytes FROM 9 FOR 4)=decode('57454250','hex')
  ELSE false END;
 IF v_signature IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Invalid catalog media signature' USING ERRCODE='22023';END IF;
 INSERT INTO hollowgate_vtt.catalog_entity_media(kind,entity_id,role,mime_type,bytes)
 VALUES(p_kind,p_id,p_role,p_type,p_bytes) ON CONFLICT(kind,entity_id,role)
 DO UPDATE SET mime_type=EXCLUDED.mime_type,bytes=EXCLUDED.bytes,updated_at=clock_timestamp();
 UPDATE hollowgate_vtt.catalog_entities SET revision=revision+1,updated_at=clock_timestamp()
 WHERE kind=p_kind AND id=p_id RETURNING * INTO v_entry;
 RETURN hollowgate_vtt.catalog_entity_document(v_entry);
END $$;

CREATE FUNCTION hollowgate_vtt.read_native_catalog_media_global(p_actor uuid,p_kind text,p_id uuid,p_role text)
RETURNS TABLE(mime_type text,bytes bytea,revision integer) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT m.mime_type,m.bytes,e.revision FROM hollowgate_vtt.catalog_entity_media m
 JOIN hollowgate_vtt.catalog_entities e ON e.kind=m.kind AND e.id=m.entity_id
 WHERE e.kind=p_kind AND e.id=p_id AND e.owner_id=p_actor AND e.status='active'
  AND m.role=p_role AND hollowgate_vtt.catalog_actor_active(p_actor)
$$;

CREATE FUNCTION hollowgate_vtt.list_native_catalog_notes_global(p_actor uuid,p_kind text,p_id uuid,p_parent uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_entry hollowgate_vtt.catalog_entities;v_notes jsonb;
BEGIN
 v_entry:=hollowgate_vtt.lock_native_catalog_entry_global(p_actor,p_kind,p_id,NULL);
 IF v_entry.id IS NULL THEN RETURN NULL;END IF;
 IF p_parent IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hollowgate_vtt.catalog_entity_notes p
  WHERE p.id=p_parent AND p.kind=p_kind AND p.entity_id=p_id AND p.parent_note_id IS NULL AND p.status='active')
 THEN RETURN NULL;END IF;
 SELECT coalesce(jsonb_agg(hollowgate_vtt.catalog_note_document(n) ORDER BY n.position,n.created_at,n.id),'[]'::jsonb)
 INTO v_notes FROM hollowgate_vtt.catalog_entity_notes n WHERE n.kind=p_kind AND n.entity_id=p_id
  AND n.parent_note_id IS NOT DISTINCT FROM p_parent AND n.status='active';
 IF jsonb_array_length(v_notes)>100 THEN RAISE EXCEPTION 'Too many catalog sibling notes' USING ERRCODE='22023';END IF;
 RETURN jsonb_build_object('item',hollowgate_vtt.catalog_entity_document(v_entry),'notes',v_notes);
END $$;

CREATE FUNCTION hollowgate_vtt.create_native_catalog_note_global(p_actor uuid,p_kind text,p_id uuid,
 p_revision integer,p_name text,p_parent uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_entry hollowgate_vtt.catalog_entities;v_note hollowgate_vtt.catalog_entity_notes;v_position integer;v_count integer;
BEGIN
 v_entry:=hollowgate_vtt.lock_native_catalog_entry_global(p_actor,p_kind,p_id,p_revision);
 IF v_entry.id IS NULL THEN RETURN NULL;END IF;
 IF p_parent IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hollowgate_vtt.catalog_entity_notes p
  WHERE p.id=p_parent AND p.kind=p_kind AND p.entity_id=p_id AND p.parent_note_id IS NULL AND p.status='active')
 THEN RETURN NULL;END IF;
 SELECT count(*),coalesce(max(n.position)+1,0) INTO v_count,v_position FROM hollowgate_vtt.catalog_entity_notes n
 WHERE n.kind=p_kind AND n.entity_id=p_id AND n.status='active' AND n.parent_note_id IS NOT DISTINCT FROM p_parent;
 IF v_count>=100 OR (SELECT count(*) FROM hollowgate_vtt.catalog_entity_notes n
  WHERE n.kind=p_kind AND n.entity_id=p_id AND n.status='active')>=1000
 THEN RAISE EXCEPTION 'Too many catalog notes' USING ERRCODE='22023';END IF;
 INSERT INTO hollowgate_vtt.catalog_entity_notes(kind,entity_id,parent_note_id,created_by,tab_name,position)
 VALUES(p_kind,p_id,p_parent,p_actor,btrim(p_name),v_position) RETURNING * INTO v_note;
 IF p_parent IS NULL THEN
  IF v_entry.data ? 'tabOrder' AND jsonb_typeof(v_entry.data->'tabOrder') NOT IN ('array','null')
  THEN RAISE EXCEPTION 'Invalid catalog tab order' USING ERRCODE='22023';END IF;
  v_entry.data:=jsonb_set(v_entry.data,'{tabOrder}',coalesce(nullif(v_entry.data->'tabOrder','null'::jsonb),'[]'::jsonb)||to_jsonb(v_note.id::text));
 END IF;
 UPDATE hollowgate_vtt.catalog_entities SET data=v_entry.data,revision=revision+1,updated_at=clock_timestamp()
 WHERE kind=p_kind AND id=p_id RETURNING * INTO v_entry;
 RETURN jsonb_build_object('item',hollowgate_vtt.catalog_entity_document(v_entry),'note',hollowgate_vtt.catalog_note_document(v_note));
END $$;

CREATE FUNCTION hollowgate_vtt.save_native_catalog_note_global(p_actor uuid,p_kind text,p_id uuid,p_note uuid,
 p_revision integer,p_name text,p_content text,p_rich jsonb,p_position integer,p_hidden boolean,p_visibility text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_entry hollowgate_vtt.catalog_entities;v_note hollowgate_vtt.catalog_entity_notes;
BEGIN
 v_entry:=hollowgate_vtt.lock_native_catalog_entry_global(p_actor,p_kind,p_id,p_revision);
 IF v_entry.id IS NULL THEN RETURN NULL;END IF;
 UPDATE hollowgate_vtt.catalog_entity_notes SET tab_name=btrim(p_name),content=p_content,content_rich=p_rich,
  position=p_position,hidden=p_hidden,visibility=p_visibility,updated_at=clock_timestamp()
 WHERE id=p_note AND kind=p_kind AND entity_id=p_id AND status='active' RETURNING * INTO v_note;
 IF NOT FOUND THEN RETURN NULL;END IF;
 UPDATE hollowgate_vtt.catalog_entities SET revision=revision+1,updated_at=clock_timestamp()
 WHERE kind=p_kind AND id=p_id RETURNING * INTO v_entry;
 RETURN jsonb_build_object('item',hollowgate_vtt.catalog_entity_document(v_entry),'note',hollowgate_vtt.catalog_note_document(v_note));
END $$;

REVOKE ALL ON FUNCTION hollowgate_vtt.lock_native_catalog_entry_global(uuid,text,uuid,integer),
 hollowgate_vtt.list_native_catalog_entries_global(uuid,text,uuid),
 hollowgate_vtt.save_native_catalog_media_global(uuid,text,uuid,integer,text,text,bytea),
 hollowgate_vtt.read_native_catalog_media_global(uuid,text,uuid,text),
 hollowgate_vtt.list_native_catalog_notes_global(uuid,text,uuid,uuid),
 hollowgate_vtt.create_native_catalog_note_global(uuid,text,uuid,integer,text,uuid),
 hollowgate_vtt.save_native_catalog_note_global(uuid,text,uuid,uuid,integer,text,text,jsonb,integer,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.lock_native_catalog_entry_global(uuid,text,uuid,integer),
 hollowgate_vtt.list_native_catalog_entries_global(uuid,text,uuid),
 hollowgate_vtt.save_native_catalog_media_global(uuid,text,uuid,integer,text,text,bytea),
 hollowgate_vtt.read_native_catalog_media_global(uuid,text,uuid,text),
 hollowgate_vtt.list_native_catalog_notes_global(uuid,text,uuid,uuid),
 hollowgate_vtt.create_native_catalog_note_global(uuid,text,uuid,integer,text,uuid),
 hollowgate_vtt.save_native_catalog_note_global(uuid,text,uuid,uuid,integer,text,text,jsonb,integer,boolean,text) TO hollowgate_api_runtime;
COMMIT;
