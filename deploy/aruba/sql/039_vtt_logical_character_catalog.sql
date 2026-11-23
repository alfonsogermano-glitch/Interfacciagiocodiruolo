-- UNRELEASED. Logical-owner catalog writes; no historical ownership backfill.
BEGIN;
ALTER TABLE hollowgate_vtt.character_drafts ADD COLUMN revision integer NOT NULL DEFAULT 1
 CHECK(revision BETWEEN 1 AND 2147483646);
ALTER TABLE hollowgate_vtt.character_drafts DROP CONSTRAINT character_drafts_name_check;
ALTER TABLE hollowgate_vtt.character_drafts ADD CONSTRAINT character_drafts_name_check
 CHECK(length(btrim(name)) BETWEEN 1 AND 500);

-- Existing writers must invalidate catalog snapshots, too. Archived records
-- cannot be resurrected by an old campaign PUT. Imported provenance is frozen.
CREATE FUNCTION hollowgate_vtt.protect_character_catalog_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_key text;
BEGIN
 IF OLD.status='archived' THEN
  RAISE EXCEPTION 'Archived character is immutable' USING ERRCODE='22023';END IF;
 IF OLD.campaign_id IS NOT NULL AND OLD.status='active' THEN
  FOREACH v_key IN ARRAY ARRAY['style','viaggio','legame','tutore','tipoSpeciale','tratti'] LOOP
   IF OLD.sheet_data ? v_key AND NEW.sheet_data->v_key IS DISTINCT FROM OLD.sheet_data->v_key THEN
    RAISE EXCEPTION 'ORIGINI_LOCKED' USING ERRCODE='22023';END IF;
  END LOOP;
 END IF;
 NEW.revision:=OLD.revision+1;
 NEW.sheet_data:=NEW.sheet_data-'sourceRecord';
 IF OLD.sheet_data ? 'sourceRecord' THEN
  NEW.sheet_data:=NEW.sheet_data||jsonb_build_object('sourceRecord',OLD.sheet_data->'sourceRecord');END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_character_catalog_revision BEFORE UPDATE ON hollowgate_vtt.character_drafts
 FOR EACH ROW EXECUTE FUNCTION hollowgate_vtt.protect_character_catalog_revision();

-- Notes/portrait changes share the character revision. The parent lock keeps
-- catalog snapshots and an atomic duplicate from silently losing child edits.
CREATE FUNCTION hollowgate_vtt.touch_character_catalog_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN
  UPDATE hollowgate_vtt.character_drafts SET updated_at=clock_timestamp() WHERE id=OLD.character_id;
 END IF;
 IF TG_OP='INSERT' OR (TG_OP='UPDATE' AND NEW.character_id IS DISTINCT FROM OLD.character_id) THEN
  UPDATE hollowgate_vtt.character_drafts SET updated_at=clock_timestamp() WHERE id=NEW.character_id;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER touch_character_catalog_notes AFTER INSERT OR UPDATE OR DELETE ON hollowgate_vtt.entity_notes
 FOR EACH ROW EXECUTE FUNCTION hollowgate_vtt.touch_character_catalog_revision();
CREATE TRIGGER touch_character_catalog_portrait AFTER INSERT OR UPDATE OR DELETE ON hollowgate_vtt.character_portraits
 FOR EACH ROW EXECUTE FUNCTION hollowgate_vtt.touch_character_catalog_revision();
CREATE TRIGGER touch_character_catalog_source AFTER INSERT OR UPDATE OR DELETE ON hollowgate_vtt.character_portrait_sources
 FOR EACH ROW EXECUTE FUNCTION hollowgate_vtt.touch_character_catalog_revision();

CREATE FUNCTION hollowgate_vtt.character_catalog_actor_active(p_actor uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM hollowgate_auth.users WHERE id=p_actor AND status='active' AND email_verified_at IS NOT NULL)
$$;
CREATE FUNCTION hollowgate_vtt.character_catalog_document(p_entry hollowgate_vtt.character_drafts)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT jsonb_build_object('id',p_entry.id,'campaignId',p_entry.campaign_id,'ownerId',p_entry.owner_id,
  'logicalOwnerId',coalesce(p_entry.logical_owner_id,p_entry.owner_id),'originalOwnerId',p_entry.original_owner_id,
  'claimableOrigin',p_entry.claimable_origin,'ruleset',p_entry.ruleset,'name',p_entry.name,
  'sheetData',p_entry.sheet_data,'status',p_entry.status,'availableForPlayers',p_entry.available_for_players,
  'revision',p_entry.revision,'createdAt',p_entry.created_at,'updatedAt',p_entry.updated_at)
$$;
CREATE FUNCTION hollowgate_vtt.get_logical_character_catalog_entry(p_actor uuid,p_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT hollowgate_vtt.character_catalog_document(d) FROM hollowgate_vtt.character_drafts d
 WHERE d.id=p_id AND d.status IN ('draft','active') AND coalesce(d.logical_owner_id,d.owner_id)=p_actor
  AND hollowgate_vtt.character_catalog_actor_active(p_actor)
  AND hollowgate_vtt.character_catalog_actor_active(d.owner_id)
$$;
CREATE FUNCTION hollowgate_vtt.list_logical_character_catalog_entries(p_actor uuid,p_after uuid)
RETURNS SETOF jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT hollowgate_vtt.character_catalog_document(d) FROM hollowgate_vtt.character_drafts d
 WHERE d.status IN ('draft','active') AND coalesce(d.logical_owner_id,d.owner_id)=p_actor
  AND (p_after IS NULL OR d.id>p_after) AND hollowgate_vtt.character_catalog_actor_active(p_actor)
  AND hollowgate_vtt.character_catalog_actor_active(d.owner_id) ORDER BY d.id LIMIT 101
$$;
CREATE FUNCTION hollowgate_vtt.lock_logical_character_catalog_entry(p_actor uuid,p_id uuid,p_revision integer)
RETURNS hollowgate_vtt.character_drafts LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_entry hollowgate_vtt.character_drafts;
BEGIN
 SELECT * INTO v_entry FROM hollowgate_vtt.character_drafts d WHERE d.id=p_id
  AND d.status IN ('draft','active') AND coalesce(d.logical_owner_id,d.owner_id)=p_actor
  AND hollowgate_vtt.character_catalog_actor_active(p_actor)
  AND hollowgate_vtt.character_catalog_actor_active(d.owner_id) FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 -- Frozen ownership remains readable/releasable after revocation, not writable
 -- in the old GM's campaign. A detached logical owner may edit their own sheet.
 IF v_entry.campaign_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM hollowgate_vtt.campaigns c WHERE c.id=v_entry.campaign_id AND c.owner_id=v_entry.owner_id
  AND (c.owner_id=p_actor OR EXISTS(SELECT 1 FROM hollowgate_vtt.campaign_members m
   WHERE m.campaign_id=c.id AND m.user_id=p_actor AND m.member_role='player' AND m.status='active' FOR SHARE OF m))
 ) THEN RETURN NULL;END IF;
 IF p_revision IS DISTINCT FROM v_entry.revision THEN
  RAISE EXCEPTION 'Character revision conflict' USING ERRCODE='40001';END IF;
 RETURN v_entry;
END $$;

CREATE FUNCTION hollowgate_vtt.validate_character_catalog_sheet(p_name text,p_ruleset text,p_sheet jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 500
  OR (p_ruleset IS NOT NULL AND p_ruleset NOT IN ('hsc','dnd5e','pathfinder','coc7e','cocclassic','custom'))
  OR p_sheet IS NULL OR jsonb_typeof(p_sheet)<>'object' OR octet_length(p_sheet::text)>100000
  OR jsonb_typeof(p_sheet->'style') IS DISTINCT FROM 'string'
  OR jsonb_typeof(p_sheet->'viaggio') IS DISTINCT FROM 'string'
  OR jsonb_typeof(p_sheet->'ambiti') IS DISTINCT FROM 'object'
  OR jsonb_typeof(p_sheet->'abilita') IS DISTINCT FROM 'object'
  OR jsonb_typeof(p_sheet->'tratti') IS DISTINCT FROM 'array'
  OR jsonb_typeof(p_sheet->'equipment') IS DISTINCT FROM 'array'
  OR p_sheet ?| ARRAY['id','ownerId','ownerProfileId','logicalOwnerId','originalOwnerId','campaignId',
   'availableForPlayers','claimableOrigin','status','revision','sourceRecord','createdAt','updatedAt',
   'chapterId','sceneId','environmentId','mapLocationId','folderId','portraitImageUrl','portraitSourceImageUrl',
   'coverImageUrl','imageUrl','portraitAssetId','portraitFrameAssetId','coverFrameAssetId']
  OR p_sheet::text ~* 'supabase[.](co|in)|data:image/'
 THEN RAISE EXCEPTION 'Invalid logical character sheet' USING ERRCODE='22023';END IF;
END $$;
CREATE FUNCTION hollowgate_vtt.create_logical_character_catalog_entry(p_actor uuid,p_name text,p_ruleset text,p_sheet jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_entry hollowgate_vtt.character_drafts;
BEGIN
 IF NOT hollowgate_vtt.character_catalog_actor_active(p_actor) THEN RETURN NULL;END IF;
 PERFORM hollowgate_vtt.validate_character_catalog_sheet(p_name,p_ruleset,p_sheet);
 IF p_ruleset IS NULL THEN RAISE EXCEPTION 'Native creation requires ruleset' USING ERRCODE='22023';END IF;
 INSERT INTO hollowgate_vtt.character_drafts(owner_id,logical_owner_id,campaign_id,name,ruleset,sheet_data,status)
 VALUES(p_actor,p_actor,NULL,btrim(p_name),p_ruleset,p_sheet,'active') RETURNING * INTO v_entry;
 RETURN hollowgate_vtt.character_catalog_document(v_entry);
END $$;
CREATE FUNCTION hollowgate_vtt.save_logical_character_catalog_entry(
 p_actor uuid,p_id uuid,p_revision integer,p_name text,p_ruleset text,p_sheet jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_entry hollowgate_vtt.character_drafts;v_key text;
BEGIN
 v_entry:=hollowgate_vtt.lock_logical_character_catalog_entry(p_actor,p_id,p_revision);
 IF v_entry.id IS NULL THEN RETURN NULL;END IF;
 PERFORM hollowgate_vtt.validate_character_catalog_sheet(p_name,p_ruleset,p_sheet);
 IF p_ruleset IS DISTINCT FROM v_entry.ruleset THEN
  RAISE EXCEPTION 'Character ruleset is immutable on sheet save' USING ERRCODE='22023';END IF;
 -- Sheet edits cannot silently discard placement/media managed by other APIs.
 FOREACH v_key IN ARRAY ARRAY['chapterId','sceneId','environmentId','mapLocationId','folderId',
  'portraitImageUrl','portraitSourceImageUrl','coverImageUrl','imageUrl','portraitAssetId','portraitFrameAssetId','coverFrameAssetId'] LOOP
  IF v_entry.sheet_data ? v_key THEN p_sheet:=p_sheet||jsonb_build_object(v_key,v_entry.sheet_data->v_key);END IF;
 END LOOP;
 UPDATE hollowgate_vtt.character_drafts SET name=btrim(p_name),sheet_data=p_sheet,status='active',updated_at=clock_timestamp()
 WHERE id=p_id RETURNING * INTO v_entry;
 RETURN hollowgate_vtt.character_catalog_document(v_entry);
END $$;
CREATE FUNCTION hollowgate_vtt.archive_logical_character_catalog_entry(p_actor uuid,p_id uuid,p_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_entry hollowgate_vtt.character_drafts;
BEGIN
 v_entry:=hollowgate_vtt.lock_logical_character_catalog_entry(p_actor,p_id,p_revision);
 IF v_entry.id IS NULL THEN RETURN NULL;END IF;
 UPDATE hollowgate_vtt.character_drafts SET status='archived',updated_at=clock_timestamp()
 WHERE id=p_id RETURNING * INTO v_entry;
 IF v_entry.campaign_id IS NOT NULL AND v_entry.owner_id<>p_actor AND NOT EXISTS(
  SELECT 1 FROM hollowgate_vtt.character_drafts d WHERE d.campaign_id=v_entry.campaign_id
   AND d.status IN ('draft','active') AND coalesce(d.logical_owner_id,d.owner_id)=p_actor
 ) THEN
  PERFORM hollowgate_vtt.set_campaign_membership(v_entry.owner_id,v_entry.campaign_id,p_actor,'player',false);
 END IF;
 RETURN hollowgate_vtt.character_catalog_document(v_entry);
END $$;

-- Old GM archive may never archive a player's claimed/logically owned PG.
CREATE TABLE hollowgate_vtt.character_catalog_duplicate_requests(
 actor_id uuid NOT NULL REFERENCES hollowgate_auth.users(id) ON DELETE RESTRICT,
 request_id uuid NOT NULL,source_id uuid NOT NULL REFERENCES hollowgate_vtt.character_drafts(id) ON DELETE RESTRICT,
 source_revision integer NOT NULL,result_id uuid NOT NULL REFERENCES hollowgate_vtt.character_drafts(id) ON DELETE RESTRICT,
 PRIMARY KEY(actor_id,request_id)
);
REVOKE ALL ON hollowgate_vtt.character_catalog_duplicate_requests FROM PUBLIC,hollowgate_api_runtime;
CREATE FUNCTION hollowgate_vtt.remap_character_catalog_order(p_order jsonb,p_ids jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_result jsonb;
BEGIN
 IF p_order IS NULL OR p_order='null'::jsonb THEN RETURN NULL;END IF;
 IF jsonb_typeof(p_order)<>'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_order) e(value) WHERE jsonb_typeof(value)<>'string')
 THEN RAISE EXCEPTION 'Invalid character tab order' USING ERRCODE='22023';END IF;
 SELECT coalesce(jsonb_agg(CASE WHEN p_ids ? lower(value) THEN p_ids->lower(value) ELSE to_jsonb(value) END ORDER BY ord),'[]'::jsonb)
 INTO v_result FROM jsonb_array_elements_text(p_order) WITH ORDINALITY e(value,ord)
 WHERE value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR p_ids ? lower(value);
 RETURN v_result;
END $$;
CREATE FUNCTION hollowgate_vtt.duplicate_logical_character_catalog_entry(
 p_actor uuid,p_id uuid,p_revision integer,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_source hollowgate_vtt.character_drafts;v_copy hollowgate_vtt.character_drafts;
 v_receipt hollowgate_vtt.character_catalog_duplicate_requests;v_ids jsonb;v_roots jsonb;v_sheet jsonb;
BEGIN
 v_source:=hollowgate_vtt.lock_logical_character_catalog_entry(p_actor,p_id,p_revision);
 IF v_source.id IS NULL THEN RETURN NULL;END IF;
 -- Claimed-player duplication needs a separately reviewed private-note/media
 -- projection. Never grant the claimant ownership of GM-private material.
 IF v_source.owner_id<>p_actor THEN RAISE EXCEPTION 'Claimed character duplication is not authorized' USING ERRCODE='42501';END IF;
 IF p_request IS NULL THEN RAISE EXCEPTION 'Duplicate request required' USING ERRCODE='22023';END IF;
 SELECT * INTO v_receipt FROM hollowgate_vtt.character_catalog_duplicate_requests WHERE actor_id=p_actor AND request_id=p_request;
 IF FOUND THEN
  IF v_receipt.source_id<>p_id OR v_receipt.source_revision<>p_revision
  THEN RAISE EXCEPTION 'Duplicate request reused' USING ERRCODE='22023';END IF;
  RETURN hollowgate_vtt.get_logical_character_catalog_entry(p_actor,v_receipt.result_id);
 END IF;
 IF (SELECT count(*) FROM hollowgate_vtt.entity_notes WHERE character_id=p_id AND status='active')>1000
 OR EXISTS(SELECT 1 FROM hollowgate_vtt.entity_notes n LEFT JOIN hollowgate_vtt.entity_notes parent ON parent.id=n.parent_note_id
  WHERE n.character_id=p_id AND n.status='active' AND (n.owner_id<>p_actor OR
   (n.parent_note_id IS NOT NULL AND (parent.id IS NULL OR parent.status<>'active' OR parent.character_id<>p_id
    OR parent.parent_note_id IS NOT NULL OR parent.owner_id<>n.owner_id OR parent.campaign_id<>n.campaign_id))))
 THEN RAISE EXCEPTION 'Invalid character note graph or owner' USING ERRCODE='22023';END IF;
 SELECT coalesce(jsonb_object_agg(id::text,gen_random_uuid()::text),'{}'::jsonb) INTO v_ids
 FROM hollowgate_vtt.entity_notes WHERE character_id=p_id AND status='active';
 SELECT coalesce(jsonb_object_agg(id::text,v_ids->id::text),'{}'::jsonb) INTO v_roots
 FROM hollowgate_vtt.entity_notes WHERE character_id=p_id AND status='active' AND parent_note_id IS NULL;
 v_sheet:=v_source.sheet_data;
 IF v_sheet ? 'tabOrder' THEN
  v_sheet:=jsonb_set(v_sheet,'{tabOrder}',coalesce(hollowgate_vtt.remap_character_catalog_order(v_sheet->'tabOrder',v_roots),'null'::jsonb));END IF;
 INSERT INTO hollowgate_vtt.character_drafts(campaign_id,owner_id,logical_owner_id,name,ruleset,sheet_data,status,
  available_for_players,claimable_origin,original_owner_id)
 VALUES(v_source.campaign_id,p_actor,p_actor,left('Copia di '||v_source.name,500),v_source.ruleset,v_sheet,'active',false,false,NULL)
 RETURNING * INTO v_copy;
 INSERT INTO hollowgate_vtt.character_portraits(character_id,mime_type,bytes)
 SELECT v_copy.id,mime_type,bytes FROM hollowgate_vtt.character_portraits WHERE character_id=p_id;
 INSERT INTO hollowgate_vtt.character_portrait_sources(character_id,mime_type,bytes)
 SELECT v_copy.id,mime_type,bytes FROM hollowgate_vtt.character_portrait_sources WHERE character_id=p_id;
 INSERT INTO hollowgate_vtt.entity_notes(id,campaign_id,character_id,owner_id,tab_name,content,content_rich,position,hidden,visibility,tab_order)
 SELECT (v_ids->>n.id::text)::uuid,n.campaign_id,v_copy.id,n.owner_id,n.tab_name,n.content,n.content_rich,n.position,n.hidden,n.visibility,
  hollowgate_vtt.remap_character_catalog_order(n.tab_order,coalesce((SELECT jsonb_object_agg(child.id::text,v_ids->child.id::text)
   FROM hollowgate_vtt.entity_notes child WHERE child.character_id=p_id AND child.parent_note_id=n.id AND child.status='active'),'{}'::jsonb))
 FROM hollowgate_vtt.entity_notes n WHERE n.character_id=p_id AND n.status='active' AND n.parent_note_id IS NULL;
 INSERT INTO hollowgate_vtt.entity_notes(id,campaign_id,character_id,owner_id,parent_note_id,tab_name,content,content_rich,position,hidden,visibility)
 SELECT (v_ids->>n.id::text)::uuid,n.campaign_id,v_copy.id,n.owner_id,(v_ids->>n.parent_note_id::text)::uuid,
  n.tab_name,n.content,n.content_rich,n.position,n.hidden,n.visibility
 FROM hollowgate_vtt.entity_notes n WHERE n.character_id=p_id AND n.status='active' AND n.parent_note_id IS NOT NULL;
 INSERT INTO hollowgate_vtt.character_catalog_duplicate_requests(actor_id,request_id,source_id,source_revision,result_id)
 VALUES(p_actor,p_request,p_id,p_revision,v_copy.id);
 SELECT * INTO v_copy FROM hollowgate_vtt.character_drafts WHERE id=v_copy.id;
 RETURN hollowgate_vtt.character_catalog_document(v_copy);
EXCEPTION WHEN unique_violation THEN
 RAISE EXCEPTION 'Duplicate conflict' USING ERRCODE='40001';
END $$;

CREATE OR REPLACE FUNCTION hollowgate_vtt.archive_owned_character(p_owner uuid,p_campaign uuid,p_character uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
 UPDATE hollowgate_vtt.character_drafts d SET status='archived',updated_at=clock_timestamp()
 FROM hollowgate_vtt.campaigns c
 WHERE d.id=p_character AND d.campaign_id=p_campaign AND d.owner_id=p_owner
  AND coalesce(d.logical_owner_id,d.owner_id)=p_owner AND d.status IN ('draft','active')
  AND c.id=d.campaign_id AND c.owner_id=p_owner AND hollowgate_vtt.character_catalog_actor_active(p_owner)
  AND NOT EXISTS(SELECT 1 FROM hollowgate_vtt.character_claims cl WHERE cl.character_id=d.id)
 RETURNING d.id INTO v_id;
 RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION hollowgate_vtt.protect_character_catalog_revision(),
 hollowgate_vtt.touch_character_catalog_revision(),hollowgate_vtt.character_catalog_actor_active(uuid),
 hollowgate_vtt.character_catalog_document(hollowgate_vtt.character_drafts),
 hollowgate_vtt.lock_logical_character_catalog_entry(uuid,uuid,integer),
 hollowgate_vtt.validate_character_catalog_sheet(text,text,jsonb),
 hollowgate_vtt.get_logical_character_catalog_entry(uuid,uuid),
 hollowgate_vtt.list_logical_character_catalog_entries(uuid,uuid),
 hollowgate_vtt.create_logical_character_catalog_entry(uuid,text,text,jsonb),
 hollowgate_vtt.save_logical_character_catalog_entry(uuid,uuid,integer,text,text,jsonb),
 hollowgate_vtt.archive_logical_character_catalog_entry(uuid,uuid,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.remap_character_catalog_order(jsonb,jsonb),
 hollowgate_vtt.duplicate_logical_character_catalog_entry(uuid,uuid,integer,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.get_logical_character_catalog_entry(uuid,uuid),
 hollowgate_vtt.list_logical_character_catalog_entries(uuid,uuid),
 hollowgate_vtt.create_logical_character_catalog_entry(uuid,text,text,jsonb),
 hollowgate_vtt.save_logical_character_catalog_entry(uuid,uuid,integer,text,text,jsonb),
 hollowgate_vtt.archive_logical_character_catalog_entry(uuid,uuid,integer) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.duplicate_logical_character_catalog_entry(uuid,uuid,integer,uuid) TO hollowgate_api_runtime;

-- Close the old catalog assignment's campaign-GM override: physical control is
-- not logical ownership. Cross-GM/dependent moves need an atomic projection
-- engine; refuse instead of leaving notes/media under the wrong campaign.
DO $assignment_guard$
DECLARE v_definition text;v_override text;v_anchor text;v_detach text;
BEGIN
 v_definition:=pg_get_functiondef('hollowgate_vtt.assign_logical_character_to_campaign(uuid,uuid,uuid)'::regprocedure);
 v_override:=' IF v_campaign_id IS NOT NULL THEN
  v_may_manage := v_may_manage OR EXISTS(
   SELECT 1 FROM hollowgate_vtt.campaigns c WHERE c.id=v_campaign_id AND c.owner_id=p_actor);
 END IF;';
 v_anchor:=' SELECT c.ruleset INTO v_target_ruleset FROM hollowgate_vtt.campaigns c WHERE c.id=p_campaign;';
 IF position(v_anchor IN v_definition)=0 THEN RAISE EXCEPTION 'Logical assignment source contract changed';END IF;
 v_definition:=replace(v_definition,
  'v_may_manage := (v_logical_owner_id=p_actor) OR (v_logical_owner_id IS NULL AND v_owner_id=p_actor);',
  'v_may_manage := COALESCE(v_logical_owner_id,v_owner_id)=p_actor;');
 IF position(v_override IN v_definition)>0 THEN
  v_definition:=replace(v_definition,v_override,'');
 ELSIF position('v_may_manage := COALESCE(v_logical_owner_id,v_owner_id)=p_actor;' IN v_definition)=0
  OR position('v_may_manage := v_may_manage OR' IN v_definition)>0
 THEN RAISE EXCEPTION 'Logical assignment ownership contract changed';END IF;
 -- RETURN QUERY appends rows; it does NOT exit a PL/pgSQL function. Legacy
 -- failure branches must stop before any detach/update below them.
 IF (length(v_definition)-length(replace(v_definition,'RETURN QUERY SELECT','')))<>7*length('RETURN QUERY SELECT')
 THEN RAISE EXCEPTION 'Logical assignment return contract changed';END IF;
 v_definition:=regexp_replace(v_definition,'(RETURN QUERY SELECT[^;]+;)(?![[:space:]]*RETURN;)','\1 RETURN;','g');
 v_detach:='UPDATE hollowgate_vtt.character_drafts SET campaign_id=NULL,updated_at=now() WHERE id=p_character;';
 IF position(v_detach IN v_definition)=0 THEN RAISE EXCEPTION 'Logical detach source contract changed';END IF;
 v_definition:=replace(v_definition,v_detach,v_detach||'
  IF v_campaign_id IS NOT NULL AND v_owner_id<>p_actor AND NOT EXISTS(
   SELECT 1 FROM hollowgate_vtt.character_drafts d WHERE d.campaign_id=v_campaign_id
    AND d.status IN (''draft'',''active'') AND coalesce(d.logical_owner_id,d.owner_id)=p_actor
  ) THEN
   PERFORM hollowgate_vtt.set_campaign_membership(v_owner_id,v_campaign_id,p_actor,''player'',false);
  END IF;');
 v_definition:=replace(v_definition,v_anchor,
 '  IF NOT EXISTS(SELECT 1 FROM hollowgate_vtt.campaigns c WHERE c.id=p_campaign AND c.owner_id=v_owner_id)
   OR (v_campaign_id IS DISTINCT FROM p_campaign AND (
    EXISTS(SELECT 1 FROM hollowgate_vtt.entity_notes WHERE character_id=p_character)
    OR EXISTS(SELECT 1 FROM hollowgate_vtt.character_portraits WHERE character_id=p_character)
    OR EXISTS(SELECT 1 FROM hollowgate_vtt.character_portrait_sources WHERE character_id=p_character)
    OR EXISTS(SELECT 1 FROM hollowgate_vtt.character_drafts d,
     LATERAL jsonb_each(d.sheet_data) e WHERE d.id=p_character
      AND e.key IN (''chapterId'',''sceneId'',''environmentId'',''mapLocationId'',''folderId'',''linkedCharacterId'',
       ''portraitImageUrl'',''portraitSourceImageUrl'',''coverImageUrl'',''imageUrl'',
       ''portraitAssetId'',''portraitFrameAssetId'',''coverFrameAssetId'')
      AND e.value NOT IN (''null''::jsonb,''""''::jsonb,''"__none__"''::jsonb))
   )) THEN
   RETURN QUERY SELECT ''projection_required''::text,NULL::uuid,NULL::text;RETURN;
  END IF;
 '||v_anchor);
 EXECUTE v_definition;
END $assignment_guard$;
COMMIT;
