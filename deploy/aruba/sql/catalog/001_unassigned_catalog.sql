-- LOCAL/UNRELEASED: native catalog identity for NEW unassigned PG/PNG/Monsters.
-- No historical backfill, campaign projection, grants on legacy tables, or
-- change to existing claim/revocation routines. Apply only in disposable QA
-- until the complete catalog release is separately reviewed and authorized.
BEGIN;
CREATE TABLE hollowgate_vtt.catalog_entities (
 kind text NOT NULL CHECK(kind IN ('characters','npcs','monsters')),
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES hollowgate_auth.users(id) ON DELETE RESTRICT,
 campaign_id uuid REFERENCES hollowgate_vtt.campaigns(id) ON DELETE RESTRICT,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 500),
 -- Historic NULL rulesets must remain representable; native creation below
 -- requires an explicit picker selection. No historical rows are imported here.
 ruleset text CHECK(ruleset IN ('hsc','dnd5e','pathfinder','coc7e','cocclassic','custom')),
 data jsonb NOT NULL CHECK(jsonb_typeof(data)='object' AND octet_length(data::text)<=100000),
 revision integer NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 2147483646),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(kind,id),
 CHECK(NOT data ?| ARRAY['id','kind','name','ruleset','ownerId','ownerProfileId','owner_id','owner_profile_id',
  'campaignId','campaign_id','revision','createdAt','updatedAt','status','sourceRecord','sourceCampaignId',
  'availableForPlayers','claimableOrigin','originalOwnerProfileId','chapterId','sceneId','environmentId',
  'mapLocationId','folderId','portraitImageUrl','portraitSourceImageUrl','coverImageUrl','imageUrl',
  'portraitAssetId','portraitFrameAssetId','coverFrameAssetId'])
);
CREATE INDEX catalog_entities_owner_kind_id_idx ON hollowgate_vtt.catalog_entities(owner_id,kind,id);
CREATE TABLE hollowgate_vtt.catalog_entity_media (
 kind text NOT NULL,
 entity_id uuid NOT NULL,
 role text NOT NULL CHECK(role IN ('portrait','source','cover')),
 mime_type text NOT NULL CHECK(mime_type IN ('image/png','image/jpeg','image/webp')),
 bytes bytea NOT NULL CHECK(octet_length(bytes) BETWEEN 12 AND 2097152),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(kind,entity_id,role),
 FOREIGN KEY(kind,entity_id) REFERENCES hollowgate_vtt.catalog_entities(kind,id) ON DELETE RESTRICT,
 CHECK(role<>'portrait' OR octet_length(bytes)<=524288)
);
REVOKE ALL ON hollowgate_vtt.catalog_entities,hollowgate_vtt.catalog_entity_media FROM PUBLIC,hollowgate_api_runtime;

CREATE FUNCTION hollowgate_vtt.catalog_actor_active(p_actor uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM hollowgate_auth.users u WHERE u.id=p_actor
  AND u.status='active' AND u.email_verified_at IS NOT NULL)
$$;

-- Internal projection. In particular data cannot override logical ownership,
-- assignment, timestamps, revision or the media list supplied by the database.
CREATE FUNCTION hollowgate_vtt.catalog_entity_document(p_entry hollowgate_vtt.catalog_entities)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT jsonb_build_object('kind',p_entry.kind,'id',p_entry.id,'ownerId',p_entry.owner_id,
  'campaignId',p_entry.campaign_id,'name',p_entry.name,'ruleset',p_entry.ruleset,
  'data',p_entry.data,'revision',p_entry.revision,'createdAt',p_entry.created_at,'updatedAt',p_entry.updated_at,
  'media',coalesce((SELECT jsonb_agg(jsonb_build_object('role',m.role,'mimeType',m.mime_type,
    'updatedAt',m.updated_at) ORDER BY m.role) FROM hollowgate_vtt.catalog_entity_media m
    WHERE m.kind=p_entry.kind AND m.entity_id=p_entry.id),'[]'::jsonb))
$$;

CREATE FUNCTION hollowgate_vtt.create_unassigned_catalog_entry(p_actor uuid,p_kind text,p_name text,p_ruleset text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_entry hollowgate_vtt.catalog_entities;
BEGIN
 IF NOT hollowgate_vtt.catalog_actor_active(p_actor) THEN RETURN NULL;END IF;
 IF p_ruleset IS NULL THEN RAISE EXCEPTION 'Ruleset required for native catalog creation' USING ERRCODE='22023';END IF;
 INSERT INTO hollowgate_vtt.catalog_entities(kind,owner_id,name,ruleset,data)
 VALUES(p_kind,p_actor,btrim(p_name),p_ruleset,p_data) RETURNING * INTO v_entry;
 RETURN hollowgate_vtt.catalog_entity_document(v_entry);
END $$;

CREATE FUNCTION hollowgate_vtt.get_unassigned_catalog_entry(p_actor uuid,p_kind text,p_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT hollowgate_vtt.catalog_entity_document(e) FROM hollowgate_vtt.catalog_entities e
 WHERE e.kind=p_kind AND e.id=p_id AND e.owner_id=p_actor AND e.campaign_id IS NULL
  AND hollowgate_vtt.catalog_actor_active(p_actor)
$$;

-- Fetch 101 to provide a continuation cursor rather than silently truncating
-- an owner's catalog. Cursor is only an ID, never proof of authorization.
CREATE FUNCTION hollowgate_vtt.list_unassigned_catalog_entries(p_actor uuid,p_kind text,p_after uuid)
RETURNS SETOF jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT hollowgate_vtt.catalog_entity_document(e) FROM hollowgate_vtt.catalog_entities e
 WHERE e.owner_id=p_actor AND e.kind=p_kind AND e.campaign_id IS NULL
  AND (p_after IS NULL OR e.id>p_after) AND hollowgate_vtt.catalog_actor_active(p_actor)
 ORDER BY e.id LIMIT 101
$$;

CREATE FUNCTION hollowgate_vtt.save_unassigned_catalog_entry(p_actor uuid,p_kind text,p_id uuid,
 p_revision integer,p_name text,p_ruleset text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_entry hollowgate_vtt.catalog_entities;
BEGIN
 SELECT * INTO v_entry FROM hollowgate_vtt.catalog_entities e WHERE e.kind=p_kind AND e.id=p_id
  AND e.owner_id=p_actor AND e.campaign_id IS NULL AND hollowgate_vtt.catalog_actor_active(p_actor)
 FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 IF p_revision IS DISTINCT FROM v_entry.revision THEN
  RAISE EXCEPTION 'Catalog revision conflict' USING ERRCODE='40001';END IF;
 UPDATE hollowgate_vtt.catalog_entities SET name=btrim(p_name),ruleset=p_ruleset,data=p_data,
  revision=revision+1,updated_at=clock_timestamp() WHERE kind=p_kind AND id=p_id RETURNING * INTO v_entry;
 RETURN hollowgate_vtt.catalog_entity_document(v_entry);
END $$;

CREATE FUNCTION hollowgate_vtt.save_unassigned_catalog_media(p_actor uuid,p_kind text,p_id uuid,
 p_revision integer,p_role text,p_type text,p_bytes bytea)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_entry hollowgate_vtt.catalog_entities;v_signature boolean;
BEGIN
 SELECT * INTO v_entry FROM hollowgate_vtt.catalog_entities e WHERE e.kind=p_kind AND e.id=p_id
  AND e.owner_id=p_actor AND e.campaign_id IS NULL AND hollowgate_vtt.catalog_actor_active(p_actor)
 FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 IF p_revision IS DISTINCT FROM v_entry.revision THEN
  RAISE EXCEPTION 'Catalog revision conflict' USING ERRCODE='40001';END IF;
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

CREATE FUNCTION hollowgate_vtt.read_unassigned_catalog_media(p_actor uuid,p_kind text,p_id uuid,p_role text)
RETURNS TABLE(mime_type text,bytes bytea,revision integer)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT m.mime_type,m.bytes,e.revision FROM hollowgate_vtt.catalog_entity_media m
 JOIN hollowgate_vtt.catalog_entities e ON e.kind=m.kind AND e.id=m.entity_id
 WHERE e.kind=p_kind AND e.id=p_id AND e.owner_id=p_actor AND e.campaign_id IS NULL
  AND m.role=p_role AND hollowgate_vtt.catalog_actor_active(p_actor)
$$;

REVOKE ALL ON FUNCTION hollowgate_vtt.catalog_actor_active(uuid),
 hollowgate_vtt.catalog_entity_document(hollowgate_vtt.catalog_entities),
 hollowgate_vtt.create_unassigned_catalog_entry(uuid,text,text,text,jsonb),
 hollowgate_vtt.get_unassigned_catalog_entry(uuid,text,uuid),
 hollowgate_vtt.list_unassigned_catalog_entries(uuid,text,uuid),
 hollowgate_vtt.save_unassigned_catalog_entry(uuid,text,uuid,integer,text,text,jsonb),
 hollowgate_vtt.save_unassigned_catalog_media(uuid,text,uuid,integer,text,text,bytea),
 hollowgate_vtt.read_unassigned_catalog_media(uuid,text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
 hollowgate_vtt.create_unassigned_catalog_entry(uuid,text,text,text,jsonb),
 hollowgate_vtt.get_unassigned_catalog_entry(uuid,text,uuid),
 hollowgate_vtt.list_unassigned_catalog_entries(uuid,text,uuid),
 hollowgate_vtt.save_unassigned_catalog_entry(uuid,text,uuid,integer,text,text,jsonb),
 hollowgate_vtt.save_unassigned_catalog_media(uuid,text,uuid,integer,text,text,bytea),
 hollowgate_vtt.read_unassigned_catalog_media(uuid,text,uuid,text) TO hollowgate_api_runtime;
COMMIT;
