-- LOCAL/UNRELEASED. Native unassigned catalog only; no historical backfill.
-- All writes lock the catalog entity, sharing its revision with sheet/media.
BEGIN;
CREATE TABLE hollowgate_vtt.catalog_entity_notes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 kind text NOT NULL,
 entity_id uuid NOT NULL,
 parent_note_id uuid,
 created_by uuid NOT NULL REFERENCES hollowgate_auth.users(id) ON DELETE RESTRICT,
 tab_name text NOT NULL CHECK(length(btrim(tab_name)) BETWEEN 1 AND 120),
 content text NOT NULL DEFAULT '' CHECK(octet_length(content)<=32768),
 content_rich jsonb CHECK(content_rich IS NULL OR
  (jsonb_typeof(content_rich)='object' AND octet_length(content_rich::text)<=1048576)),
 position integer NOT NULL CHECK(position BETWEEN 0 AND 10000),
 hidden boolean NOT NULL DEFAULT false,
 visibility text NOT NULL DEFAULT 'all' CHECK(visibility IN ('all','private')),
 tab_order jsonb CHECK(tab_order IS NULL OR (jsonb_typeof(tab_order)='array' AND octet_length(tab_order::text)<=4100)),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(kind,entity_id,id),
 FOREIGN KEY(kind,entity_id) REFERENCES hollowgate_vtt.catalog_entities(kind,id) ON DELETE RESTRICT,
 FOREIGN KEY(kind,entity_id,parent_note_id) REFERENCES hollowgate_vtt.catalog_entity_notes(kind,entity_id,id) ON DELETE RESTRICT,
 CHECK(parent_note_id IS DISTINCT FROM id),
 CHECK(parent_note_id IS NULL OR tab_order IS NULL)
);
CREATE INDEX catalog_notes_scope_idx ON hollowgate_vtt.catalog_entity_notes(kind,entity_id,status,parent_note_id,position);
CREATE TABLE hollowgate_vtt.catalog_duplicate_requests (
 actor_id uuid NOT NULL REFERENCES hollowgate_auth.users(id) ON DELETE RESTRICT,
 request_id uuid NOT NULL,
 kind text NOT NULL,
 source_id uuid NOT NULL,
 source_revision integer NOT NULL CHECK(source_revision BETWEEN 1 AND 2147483646),
 result_id uuid NOT NULL,
 PRIMARY KEY(actor_id,request_id),
 FOREIGN KEY(kind,source_id) REFERENCES hollowgate_vtt.catalog_entities(kind,id) ON DELETE RESTRICT,
 FOREIGN KEY(kind,result_id) REFERENCES hollowgate_vtt.catalog_entities(kind,id) ON DELETE RESTRICT
);
REVOKE ALL ON hollowgate_vtt.catalog_entity_notes,hollowgate_vtt.catalog_duplicate_requests FROM PUBLIC,hollowgate_api_runtime;

CREATE FUNCTION hollowgate_vtt.protect_catalog_note_depth()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF NEW.parent_note_id IS NOT NULL AND (NOT EXISTS(
  SELECT 1 FROM hollowgate_vtt.catalog_entity_notes p WHERE p.id=NEW.parent_note_id
   AND p.kind=NEW.kind AND p.entity_id=NEW.entity_id AND p.parent_note_id IS NULL
   AND (NEW.status='archived' OR p.status='active')) OR EXISTS(
  SELECT 1 FROM hollowgate_vtt.catalog_entity_notes child WHERE child.parent_note_id=NEW.id))
 THEN RAISE EXCEPTION 'Invalid catalog note parent' USING ERRCODE='22023';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER catalog_note_depth BEFORE INSERT OR UPDATE ON hollowgate_vtt.catalog_entity_notes
 FOR EACH ROW EXECUTE FUNCTION hollowgate_vtt.protect_catalog_note_depth();

CREATE FUNCTION hollowgate_vtt.lock_unassigned_catalog_entry(p_actor uuid,p_kind text,p_id uuid,p_revision integer)
RETURNS hollowgate_vtt.catalog_entities LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_entry hollowgate_vtt.catalog_entities;
BEGIN
 SELECT * INTO v_entry FROM hollowgate_vtt.catalog_entities e WHERE e.kind=p_kind AND e.id=p_id
  AND e.owner_id=p_actor AND e.campaign_id IS NULL AND hollowgate_vtt.catalog_actor_active(p_actor) FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 IF p_revision IS DISTINCT FROM v_entry.revision THEN
  RAISE EXCEPTION 'Catalog revision conflict' USING ERRCODE='40001';END IF;
 RETURN v_entry;
END $$;

CREATE FUNCTION hollowgate_vtt.catalog_note_document(p_note hollowgate_vtt.catalog_entity_notes)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT jsonb_build_object('id',p_note.id,'tab_name',p_note.tab_name,'content',p_note.content,
  'content_rich',p_note.content_rich,'position',p_note.position,'hidden',p_note.hidden,
  'visibility',p_note.visibility,'parent_note_id',p_note.parent_note_id,'tab_order',p_note.tab_order,
  'owner_profile_id',p_note.created_by,'folder_id',NULL,'created_at',p_note.created_at,'updated_at',p_note.updated_at)
$$;

CREATE FUNCTION hollowgate_vtt.list_unassigned_catalog_notes(p_actor uuid,p_kind text,p_id uuid,p_parent uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_entry hollowgate_vtt.catalog_entities;v_notes jsonb;
BEGIN
 SELECT * INTO v_entry FROM hollowgate_vtt.catalog_entities e WHERE e.kind=p_kind AND e.id=p_id
  AND e.owner_id=p_actor AND e.campaign_id IS NULL AND hollowgate_vtt.catalog_actor_active(p_actor) FOR SHARE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 IF p_parent IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hollowgate_vtt.catalog_entity_notes p
  WHERE p.id=p_parent AND p.kind=p_kind AND p.entity_id=p_id AND p.parent_note_id IS NULL AND p.status='active')
 THEN RETURN NULL;END IF;
 SELECT coalesce(jsonb_agg(hollowgate_vtt.catalog_note_document(n) ORDER BY n.position,n.created_at,n.id),'[]'::jsonb)
 INTO v_notes FROM hollowgate_vtt.catalog_entity_notes n WHERE n.kind=p_kind AND n.entity_id=p_id
  AND n.parent_note_id IS NOT DISTINCT FROM p_parent AND n.status='active';
 IF jsonb_array_length(v_notes)>100 THEN RAISE EXCEPTION 'Too many catalog sibling notes' USING ERRCODE='22023';END IF;
 RETURN jsonb_build_object('item',hollowgate_vtt.catalog_entity_document(v_entry),'notes',v_notes);
END $$;

CREATE FUNCTION hollowgate_vtt.create_unassigned_catalog_note(p_actor uuid,p_kind text,p_id uuid,
 p_revision integer,p_name text,p_parent uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_entry hollowgate_vtt.catalog_entities;v_note hollowgate_vtt.catalog_entity_notes;v_position integer;v_count integer;
BEGIN
 v_entry:=hollowgate_vtt.lock_unassigned_catalog_entry(p_actor,p_kind,p_id,p_revision);
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
 ELSE
  UPDATE hollowgate_vtt.catalog_entity_notes SET tab_order=CASE WHEN tab_order IS NULL THEN NULL ELSE tab_order||to_jsonb(v_note.id::text) END,
   updated_at=clock_timestamp() WHERE id=p_parent;
 END IF;
 UPDATE hollowgate_vtt.catalog_entities SET data=v_entry.data,revision=revision+1,updated_at=clock_timestamp()
 WHERE kind=p_kind AND id=p_id RETURNING * INTO v_entry;
 RETURN jsonb_build_object('item',hollowgate_vtt.catalog_entity_document(v_entry),'note',hollowgate_vtt.catalog_note_document(v_note));
END $$;

CREATE FUNCTION hollowgate_vtt.save_unassigned_catalog_note(p_actor uuid,p_kind text,p_id uuid,p_note uuid,
 p_revision integer,p_name text,p_content text,p_rich jsonb,p_position integer,p_hidden boolean,p_visibility text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_entry hollowgate_vtt.catalog_entities;v_note hollowgate_vtt.catalog_entity_notes;
BEGIN
 v_entry:=hollowgate_vtt.lock_unassigned_catalog_entry(p_actor,p_kind,p_id,p_revision);
 IF v_entry.id IS NULL THEN RETURN NULL;END IF;
 UPDATE hollowgate_vtt.catalog_entity_notes SET tab_name=btrim(p_name),content=p_content,content_rich=p_rich,
  position=p_position,hidden=p_hidden,visibility=p_visibility,updated_at=clock_timestamp()
 WHERE id=p_note AND kind=p_kind AND entity_id=p_id AND status='active' RETURNING * INTO v_note;
 IF NOT FOUND THEN RETURN NULL;END IF;
 UPDATE hollowgate_vtt.catalog_entities SET revision=revision+1,updated_at=clock_timestamp()
 WHERE kind=p_kind AND id=p_id RETURNING * INTO v_entry;
 RETURN jsonb_build_object('item',hollowgate_vtt.catalog_entity_document(v_entry),'note',hollowgate_vtt.catalog_note_document(v_note));
END $$;

CREATE FUNCTION hollowgate_vtt.order_unassigned_catalog_subtabs(p_actor uuid,p_kind text,p_id uuid,p_parent uuid,
 p_revision integer,p_order jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_entry hollowgate_vtt.catalog_entities;v_note hollowgate_vtt.catalog_entity_notes;v_count integer;v_distinct integer;
BEGIN
 v_entry:=hollowgate_vtt.lock_unassigned_catalog_entry(p_actor,p_kind,p_id,p_revision);
 IF v_entry.id IS NULL THEN RETURN NULL;END IF;
 IF p_order IS NULL OR jsonb_typeof(p_order)<>'array' OR jsonb_array_length(p_order)>100
 THEN RAISE EXCEPTION 'Invalid catalog subtab order' USING ERRCODE='22023';END IF;
 SELECT count(*),count(DISTINCT lower(value)) INTO v_count,v_distinct FROM jsonb_array_elements_text(p_order) e(value)
 WHERE value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
 IF v_count<>jsonb_array_length(p_order) OR v_distinct<>v_count
 THEN RAISE EXCEPTION 'Invalid catalog subtab identifiers' USING ERRCODE='22023';END IF;
 IF v_count<>(SELECT count(*) FROM hollowgate_vtt.catalog_entity_notes n WHERE n.kind=p_kind
  AND n.entity_id=p_id AND n.parent_note_id=p_parent AND n.status='active') OR EXISTS(
  SELECT 1 FROM jsonb_array_elements_text(p_order) e(value) WHERE NOT EXISTS(
   SELECT 1 FROM hollowgate_vtt.catalog_entity_notes n WHERE n.id=e.value::uuid AND n.kind=p_kind
    AND n.entity_id=p_id AND n.parent_note_id=p_parent AND n.status='active'))
 THEN RETURN NULL;END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(lower(value)) ORDER BY ord),'[]'::jsonb) INTO p_order
 FROM jsonb_array_elements_text(p_order) WITH ORDINALITY e(value,ord);
 UPDATE hollowgate_vtt.catalog_entity_notes SET tab_order=p_order,updated_at=clock_timestamp()
 WHERE id=p_parent AND kind=p_kind AND entity_id=p_id AND parent_note_id IS NULL AND status='active' RETURNING * INTO v_note;
 IF NOT FOUND THEN RETURN NULL;END IF;
 UPDATE hollowgate_vtt.catalog_entities SET revision=revision+1,updated_at=clock_timestamp()
 WHERE kind=p_kind AND id=p_id RETURNING * INTO v_entry;
 RETURN jsonb_build_object('item',hollowgate_vtt.catalog_entity_document(v_entry),'note',hollowgate_vtt.catalog_note_document(v_note));
END $$;

CREATE FUNCTION hollowgate_vtt.archive_unassigned_catalog_note(p_actor uuid,p_kind text,p_id uuid,p_note uuid,p_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_entry hollowgate_vtt.catalog_entities;v_note hollowgate_vtt.catalog_entity_notes;
BEGIN
 v_entry:=hollowgate_vtt.lock_unassigned_catalog_entry(p_actor,p_kind,p_id,p_revision);
 IF v_entry.id IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO v_note FROM hollowgate_vtt.catalog_entity_notes n WHERE n.id=p_note AND n.kind=p_kind AND n.entity_id=p_id AND n.status='active';
 IF NOT FOUND THEN RETURN NULL;END IF;
 UPDATE hollowgate_vtt.catalog_entity_notes SET status='archived',updated_at=clock_timestamp()
 WHERE kind=p_kind AND entity_id=p_id AND (id=p_note OR parent_note_id=p_note) AND status='active';
 IF v_note.parent_note_id IS NULL THEN
  IF jsonb_typeof(v_entry.data->'tabOrder')='array' THEN
   SELECT jsonb_set(v_entry.data,'{tabOrder}',coalesce(jsonb_agg(value ORDER BY ord),'[]'::jsonb)) INTO v_entry.data
   FROM jsonb_array_elements(v_entry.data->'tabOrder') WITH ORDINALITY e(value,ord) WHERE lower(value#>>'{}')<>p_note::text;
  END IF;
 ELSE
  UPDATE hollowgate_vtt.catalog_entity_notes SET tab_order=(SELECT coalesce(jsonb_agg(value ORDER BY ord),'[]'::jsonb)
   FROM jsonb_array_elements(tab_order) WITH ORDINALITY e(value,ord) WHERE lower(value#>>'{}')<>p_note::text),updated_at=clock_timestamp()
  WHERE id=v_note.parent_note_id AND tab_order IS NOT NULL;
 END IF;
 UPDATE hollowgate_vtt.catalog_entities SET data=v_entry.data,revision=revision+1,updated_at=clock_timestamp()
 WHERE kind=p_kind AND id=p_id RETURNING * INTO v_entry;
 RETURN jsonb_build_object('item',hollowgate_vtt.catalog_entity_document(v_entry),'archivedId',p_note);
END $$;

-- Rewrite ONLY structural tab identifiers. Built-in names stay intact;
-- stale/deleted custom UUIDs are dropped, matching the original UI reconcile.
-- Note text, rich documents and arbitrary embedded links are never regex-edited.
CREATE FUNCTION hollowgate_vtt.remap_catalog_tab_order(p_order jsonb,p_ids jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_result jsonb;
BEGIN
 IF p_order IS NULL OR p_order='null'::jsonb THEN RETURN NULL;END IF;
 IF jsonb_typeof(p_order)<>'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_order) e(value) WHERE jsonb_typeof(value)<>'string')
 THEN RAISE EXCEPTION 'Invalid catalog tab order' USING ERRCODE='22023';END IF;
 SELECT coalesce(jsonb_agg(CASE WHEN p_ids ? lower(value) THEN p_ids->lower(value) ELSE to_jsonb(value) END ORDER BY ord),'[]'::jsonb)
 INTO v_result FROM jsonb_array_elements_text(p_order) WITH ORDINALITY e(value,ord)
 WHERE value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR p_ids ? lower(value);
 RETURN v_result;
END $$;

CREATE FUNCTION hollowgate_vtt.duplicate_unassigned_catalog_entry(p_actor uuid,p_kind text,p_id uuid,p_revision integer,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_source hollowgate_vtt.catalog_entities;v_copy hollowgate_vtt.catalog_entities;
 v_receipt hollowgate_vtt.catalog_duplicate_requests;v_ids jsonb;v_roots jsonb;v_data jsonb;
BEGIN
 SELECT * INTO v_source FROM hollowgate_vtt.catalog_entities e WHERE e.kind=p_kind AND e.id=p_id
  AND e.owner_id=p_actor AND e.campaign_id IS NULL AND hollowgate_vtt.catalog_actor_active(p_actor) FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO v_receipt FROM hollowgate_vtt.catalog_duplicate_requests WHERE actor_id=p_actor AND request_id=p_request;
 IF FOUND THEN
  IF v_receipt.kind<>p_kind OR v_receipt.source_id<>p_id OR v_receipt.source_revision IS DISTINCT FROM p_revision
  THEN RAISE EXCEPTION 'Catalog duplicate request reused' USING ERRCODE='22023';END IF;
  RETURN hollowgate_vtt.get_unassigned_catalog_entry(p_actor,p_kind,v_receipt.result_id);
 END IF;
 IF p_revision IS DISTINCT FROM v_source.revision THEN RAISE EXCEPTION 'Catalog revision conflict' USING ERRCODE='40001';END IF;
 IF p_request IS NULL THEN RAISE EXCEPTION 'Catalog duplicate request required' USING ERRCODE='22023';END IF;
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
 INSERT INTO hollowgate_vtt.catalog_entities(kind,owner_id,name,ruleset,data)
 -- Original inserts "Copia di " without revalidating a UI max length. The
 -- 500-character bound is an infrastructure guard; it only affects names
 -- within 9 characters of that bound and never truncates realistic names.
 VALUES(p_kind,p_actor,left('Copia di '||v_source.name,500),v_source.ruleset,v_data) RETURNING * INTO v_copy;
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
 INSERT INTO hollowgate_vtt.catalog_duplicate_requests(actor_id,request_id,kind,source_id,source_revision,result_id)
 VALUES(p_actor,p_request,p_kind,p_id,p_revision,v_copy.id);
 RETURN hollowgate_vtt.catalog_entity_document(v_copy);
EXCEPTION WHEN unique_violation THEN
 RAISE EXCEPTION 'Catalog duplicate conflict' USING ERRCODE='40001';
END $$;

REVOKE ALL ON FUNCTION
 hollowgate_vtt.protect_catalog_note_depth(),
 hollowgate_vtt.lock_unassigned_catalog_entry(uuid,text,uuid,integer),
 hollowgate_vtt.catalog_note_document(hollowgate_vtt.catalog_entity_notes),
 hollowgate_vtt.remap_catalog_tab_order(jsonb,jsonb),
 hollowgate_vtt.list_unassigned_catalog_notes(uuid,text,uuid,uuid),
 hollowgate_vtt.create_unassigned_catalog_note(uuid,text,uuid,integer,text,uuid),
 hollowgate_vtt.save_unassigned_catalog_note(uuid,text,uuid,uuid,integer,text,text,jsonb,integer,boolean,text),
 hollowgate_vtt.order_unassigned_catalog_subtabs(uuid,text,uuid,uuid,integer,jsonb),
 hollowgate_vtt.archive_unassigned_catalog_note(uuid,text,uuid,uuid,integer),
 hollowgate_vtt.duplicate_unassigned_catalog_entry(uuid,text,uuid,integer,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
 hollowgate_vtt.list_unassigned_catalog_notes(uuid,text,uuid,uuid),
 hollowgate_vtt.create_unassigned_catalog_note(uuid,text,uuid,integer,text,uuid),
 hollowgate_vtt.save_unassigned_catalog_note(uuid,text,uuid,uuid,integer,text,text,jsonb,integer,boolean,text),
 hollowgate_vtt.order_unassigned_catalog_subtabs(uuid,text,uuid,uuid,integer,jsonb),
 hollowgate_vtt.archive_unassigned_catalog_note(uuid,text,uuid,uuid,integer),
 hollowgate_vtt.duplicate_unassigned_catalog_entry(uuid,text,uuid,integer,uuid) TO hollowgate_api_runtime;
COMMIT;
