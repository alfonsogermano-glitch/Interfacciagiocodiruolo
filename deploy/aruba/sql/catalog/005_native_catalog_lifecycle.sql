-- UNRELEASED: native records only. No historical import or ownership inference.
-- Retain identity, media and notes across assignment/detachment/archive.
BEGIN;
ALTER TABLE hollowgate_vtt.catalog_entities ADD COLUMN status text NOT NULL DEFAULT 'active'
 CHECK(status IN ('active','archived'));

CREATE FUNCTION hollowgate_vtt.native_catalog_context_authorized(p_actor uuid,p_campaign uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT hollowgate_vtt.catalog_actor_active(p_actor) AND
  (p_campaign IS NULL OR EXISTS(SELECT 1 FROM hollowgate_vtt.campaigns c
   WHERE c.id=p_campaign AND c.owner_id=p_actor))
$$;
REVOKE ALL ON FUNCTION hollowgate_vtt.native_catalog_context_authorized(uuid,uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION hollowgate_vtt.catalog_entity_document(p_entry hollowgate_vtt.catalog_entities)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT jsonb_build_object('kind',p_entry.kind,'id',p_entry.id,'ownerId',p_entry.owner_id,
  'campaignId',p_entry.campaign_id,'name',p_entry.name,'ruleset',p_entry.ruleset,'status',p_entry.status,
  'data',p_entry.data,'revision',p_entry.revision,'createdAt',p_entry.created_at,'updatedAt',p_entry.updated_at,
  'media',coalesce((SELECT jsonb_agg(jsonb_build_object('role',m.role,'mimeType',m.mime_type,
   'updatedAt',m.updated_at) ORDER BY m.role) FROM hollowgate_vtt.catalog_entity_media m
   WHERE m.kind=p_entry.kind AND m.entity_id=p_entry.id),'[]'::jsonb))
$$;

-- Reuse the reviewed 001-004 bodies instead of maintaining divergent copies of
-- note graph/media/CAS logic. Sources/signatures and the scope anchor are exact;
-- unexpected upstream definitions abort this whole migration.
DO $migration$
DECLARE r record;v_oid oid;v_definition text;v_native text;m record;
BEGIN
 FOR r IN SELECT * FROM (VALUES
  ('create_unassigned_catalog_entry','create_native_catalog_entry',false,true),
  ('get_unassigned_catalog_entry','get_native_catalog_entry',true,true),
  ('list_unassigned_catalog_entries','list_native_catalog_entries',true,true),
  ('save_unassigned_catalog_entry','save_native_catalog_entry',true,true),
  ('save_unassigned_catalog_media','save_native_catalog_media',true,true),
  ('read_unassigned_catalog_media','read_native_catalog_media',true,true),
  ('lock_unassigned_catalog_entry','lock_native_catalog_entry',true,false),
  ('list_unassigned_catalog_notes','list_native_catalog_notes',true,true),
  ('create_unassigned_catalog_note','create_native_catalog_note',false,true),
  ('save_unassigned_catalog_note','save_native_catalog_note',false,true),
  ('order_unassigned_catalog_subtabs','order_native_catalog_subtabs',false,true),
  ('archive_unassigned_catalog_note','archive_native_catalog_note',false,true),
  ('duplicate_unassigned_catalog_entry','duplicate_native_catalog_entry',true,true),
  ('copy_unassigned_catalog_to_campaign_v003','copy_native_catalog_to_campaign_internal',true,false),
  ('copy_unassigned_catalog_to_campaign',NULL,true,false)
 ) AS definitions(old_name,new_name,has_scope,is_public)
 LOOP
  IF (SELECT count(*) FROM pg_proc WHERE pronamespace='hollowgate_vtt'::regnamespace AND proname=r.old_name)<>1
  THEN RAISE EXCEPTION 'Unexpected native catalog migration source';END IF;
  SELECT oid INTO v_oid FROM pg_proc WHERE pronamespace='hollowgate_vtt'::regnamespace AND proname=r.old_name;
  v_definition:=pg_get_functiondef(v_oid);
  IF r.has_scope AND (length(v_definition)-length(replace(v_definition,'e.campaign_id IS NULL','')))<>length('e.campaign_id IS NULL')
  THEN RAISE EXCEPTION 'Unexpected native catalog scope anchor';END IF;
  IF r.has_scope THEN
   EXECUTE replace(v_definition,'e.campaign_id IS NULL','e.status=''active'' AND e.campaign_id IS NULL');
  END IF;
  IF r.new_name IS NULL THEN CONTINUE;END IF;
  v_native:=replace(v_definition,'e.campaign_id IS NULL',
   'e.status=''active'' AND hollowgate_vtt.native_catalog_context_authorized(p_actor,e.campaign_id)');
  v_native:=replace(v_native,'hollowgate_vtt.'||r.old_name||'(','hollowgate_vtt.'||r.new_name||'(');
  FOR m IN SELECT * FROM (VALUES
   ('get_unassigned_catalog_entry','get_native_catalog_entry'),
   ('lock_unassigned_catalog_entry','lock_native_catalog_entry')
  ) AS mappings(old_name,new_name) LOOP
   v_native:=replace(v_native,'hollowgate_vtt.'||m.old_name||'(','hollowgate_vtt.'||m.new_name||'(');
  END LOOP;
  IF r.old_name='duplicate_unassigned_catalog_entry' THEN
   IF position('INSERT INTO hollowgate_vtt.catalog_entities(kind,owner_id,name,ruleset,data)' IN v_native)=0
    OR position('v_source.ruleset,v_data)' IN v_native)=0
   THEN RAISE EXCEPTION 'Unexpected native duplicate insertion';END IF;
   v_native:=replace(v_native,'INSERT INTO hollowgate_vtt.catalog_entities(kind,owner_id,name,ruleset,data)',
    'INSERT INTO hollowgate_vtt.catalog_entities(kind,owner_id,name,ruleset,data,campaign_id)');
   v_native:=replace(v_native,'v_source.ruleset,v_data)','v_source.ruleset,v_data,v_source.campaign_id)');
  END IF;
  EXECUTE v_native;
  SELECT oid INTO v_oid FROM pg_proc WHERE pronamespace='hollowgate_vtt'::regnamespace AND proname=r.new_name;
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,hollowgate_api_runtime',v_oid::regprocedure);
  IF r.is_public THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO hollowgate_api_runtime',v_oid::regprocedure);END IF;
 END LOOP;
END $migration$;

CREATE FUNCTION hollowgate_vtt.protect_native_catalog_lifecycle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_ruleset text;
BEGIN
 IF TG_OP='UPDATE' AND OLD.status='archived' THEN
  RAISE EXCEPTION 'Archived native catalog entry is immutable' USING ERRCODE='22023';END IF;
 IF NEW.campaign_id IS NOT NULL THEN
  SELECT c.ruleset INTO v_ruleset FROM hollowgate_vtt.campaigns c
   WHERE c.id=NEW.campaign_id AND c.owner_id=NEW.owner_id FOR SHARE;
  IF NOT FOUND OR NEW.ruleset IS NULL OR NEW.ruleset IS DISTINCT FROM v_ruleset THEN
   RAISE EXCEPTION 'Invalid native catalog campaign context' USING ERRCODE='22023';END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION hollowgate_vtt.protect_native_catalog_lifecycle() FROM PUBLIC;
CREATE TRIGGER protect_native_catalog_lifecycle BEFORE INSERT OR UPDATE ON hollowgate_vtt.catalog_entities
 FOR EACH ROW EXECUTE FUNCTION hollowgate_vtt.protect_native_catalog_lifecycle();

CREATE FUNCTION hollowgate_vtt.assign_native_catalog_entry(p_actor uuid,p_kind text,p_id uuid,p_revision integer,p_campaign uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_entry hollowgate_vtt.catalog_entities;v_ruleset text;
BEGIN
 -- PG must use the logical character/claim lifecycle, not a parallel assignment.
 IF p_kind NOT IN ('npcs','monsters') THEN
  RAISE EXCEPTION 'Native assignment supports narrative entities only' USING ERRCODE='22023';END IF;
 v_entry:=hollowgate_vtt.lock_native_catalog_entry(p_actor,p_kind,p_id,p_revision);
 IF v_entry.id IS NULL THEN RETURN NULL;END IF;
 IF p_campaign IS NOT NULL THEN
  SELECT c.ruleset INTO v_ruleset FROM hollowgate_vtt.campaigns c
   WHERE c.id=p_campaign AND c.owner_id=p_actor FOR SHARE;
  IF NOT FOUND THEN RETURN NULL;END IF;
  IF v_entry.ruleset IS NOT NULL AND v_entry.ruleset IS DISTINCT FROM v_ruleset THEN
   RAISE EXCEPTION 'Incompatible catalog ruleset' USING ERRCODE='22023';END IF;
 END IF;
 UPDATE hollowgate_vtt.catalog_entities SET campaign_id=p_campaign,
  ruleset=coalesce(v_entry.ruleset,v_ruleset),revision=revision+1,updated_at=clock_timestamp()
 WHERE kind=p_kind AND id=p_id RETURNING * INTO v_entry;
 RETURN hollowgate_vtt.catalog_entity_document(v_entry);
END $$;

CREATE FUNCTION hollowgate_vtt.archive_native_catalog_entry(p_actor uuid,p_kind text,p_id uuid,p_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_entry hollowgate_vtt.catalog_entities;
BEGIN
 v_entry:=hollowgate_vtt.lock_native_catalog_entry(p_actor,p_kind,p_id,p_revision);
 IF v_entry.id IS NULL THEN RETURN NULL;END IF;
 UPDATE hollowgate_vtt.catalog_entities SET status='archived',revision=revision+1,updated_at=clock_timestamp()
 WHERE kind=p_kind AND id=p_id RETURNING * INTO v_entry;
 RETURN hollowgate_vtt.catalog_entity_document(v_entry);
END $$;

CREATE FUNCTION hollowgate_vtt.copy_native_catalog_to_campaign(
 p_actor uuid,p_kind text,p_id uuid,p_target_campaign uuid,p_revision integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_entry hollowgate_vtt.catalog_entities;v_ruleset text;
BEGIN
 v_entry:=hollowgate_vtt.lock_native_catalog_entry(p_actor,p_kind,p_id,p_revision);
 IF v_entry.id IS NULL THEN RETURN NULL;END IF;
 SELECT c.ruleset INTO v_ruleset FROM hollowgate_vtt.campaigns c
  WHERE c.id=p_target_campaign AND c.owner_id=p_actor FOR SHARE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 IF v_entry.ruleset IS NULL OR v_entry.ruleset IS DISTINCT FROM v_ruleset THEN
  RAISE EXCEPTION 'Incompatible catalog ruleset' USING ERRCODE='22023';END IF;
 RETURN hollowgate_vtt.copy_native_catalog_to_campaign_internal(p_actor,p_kind,p_id,p_target_campaign,p_revision);
END $$;
REVOKE ALL ON FUNCTION hollowgate_vtt.assign_native_catalog_entry(uuid,text,uuid,integer,uuid),
 hollowgate_vtt.archive_native_catalog_entry(uuid,text,uuid,integer),
 hollowgate_vtt.copy_native_catalog_to_campaign(uuid,text,uuid,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.assign_native_catalog_entry(uuid,text,uuid,integer,uuid),
 hollowgate_vtt.archive_native_catalog_entry(uuid,text,uuid,integer),
 hollowgate_vtt.copy_native_catalog_to_campaign(uuid,text,uuid,uuid,integer) TO hollowgate_api_runtime;
COMMIT;
