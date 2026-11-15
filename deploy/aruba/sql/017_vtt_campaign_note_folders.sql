-- 017: Original Campaign Notes folders, isolated from entity/character tabs.
-- CI-only. No HTTP endpoints or live staging activation.
BEGIN;
CREATE TABLE hollowgate_vtt.campaign_note_folders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 campaign_id uuid NOT NULL REFERENCES hollowgate_vtt.campaigns(id) ON DELETE RESTRICT,
 scope text NOT NULL CHECK(scope IN ('gm','shared')),
 parent_folder_id uuid REFERENCES hollowgate_vtt.campaign_note_folders(id) ON DELETE RESTRICT,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 120),
 icon text CHECK(icon IS NULL OR length(icon)<=80),
 position integer NOT NULL DEFAULT 0 CHECK(position BETWEEN 0 AND 10000),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT no_self_folder CHECK(parent_folder_id IS DISTINCT FROM id)
);
CREATE INDEX campaign_note_folders_by_scope
 ON hollowgate_vtt.campaign_note_folders(campaign_id,scope,parent_folder_id,status,position);
REVOKE ALL ON hollowgate_vtt.campaign_note_folders FROM PUBLIC,hollowgate_api_runtime;

CREATE FUNCTION hollowgate_vtt.list_member_note_folders(
 p_user uuid,p_campaign uuid,p_scope text)
RETURNS TABLE(id uuid,name text,parent_folder_id uuid,icon text,folder_position integer,scope text)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT f.id,f.name,f.parent_folder_id,f.icon,f.position,f.scope
 FROM hollowgate_vtt.campaign_note_folders f
 WHERE f.campaign_id=p_campaign AND f.scope=p_scope AND f.status='active'
 AND p_scope IN ('shared','gm') AND (
   (p_scope='shared' AND hollowgate_vtt.campaign_member_role(p_user,p_campaign) IS NOT NULL)
   OR (p_scope='gm' AND hollowgate_vtt.campaign_member_role(p_user,p_campaign)='gm')
 )
 ORDER BY f.position,f.created_at,f.id LIMIT 500
$$;

CREATE FUNCTION hollowgate_vtt.create_owned_note_folder(
 p_owner uuid,p_campaign uuid,p_scope text,p_name text,p_parent uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_id uuid;v_at uuid:=p_parent;v_depth integer:=1;v_position integer;
BEGIN
 IF p_scope IS NULL OR p_scope NOT IN ('shared','gm')
  OR p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 120
 THEN RAISE EXCEPTION 'Invalid folder input' USING ERRCODE='22023';END IF;
 IF NOT EXISTS(SELECT 1 FROM hollowgate_vtt.campaigns c
  JOIN hollowgate_auth.users u ON u.id=c.owner_id
  WHERE c.id=p_campaign AND c.owner_id=p_owner AND u.status='active'
   AND u.email_verified_at IS NOT NULL) THEN RETURN NULL;END IF;
 WHILE v_at IS NOT NULL LOOP
  v_depth:=v_depth+1;
  IF v_depth>5 THEN RETURN NULL;END IF;
  SELECT f.parent_folder_id INTO v_at FROM hollowgate_vtt.campaign_note_folders f
  WHERE f.id=v_at AND f.campaign_id=p_campaign AND f.scope=p_scope AND f.status='active';
  IF NOT FOUND THEN RETURN NULL;END IF;
 END LOOP;
 SELECT count(*) INTO v_position FROM hollowgate_vtt.campaign_note_folders f
 WHERE f.campaign_id=p_campaign AND f.scope=p_scope AND f.status='active'
  AND f.parent_folder_id IS NOT DISTINCT FROM p_parent;
 IF v_position>=500 THEN RAISE EXCEPTION 'Too many folders' USING ERRCODE='22023';END IF;
 INSERT INTO hollowgate_vtt.campaign_note_folders(campaign_id,scope,name,parent_folder_id,position)
 VALUES(p_campaign,p_scope,btrim(p_name),p_parent,v_position) RETURNING id INTO v_id;
 RETURN v_id;
END $$;

-- Move/rename only after validating every ancestor and the entire subtree.
-- Parent cannot belong to a different campaign or Note section, and a folder
-- cannot be moved into itself or one of its descendants.
CREATE FUNCTION hollowgate_vtt.update_owned_note_folder(
 p_owner uuid,p_campaign uuid,p_folder uuid,p_name text,p_parent uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_scope text;v_at uuid:=p_parent;v_depth integer:=1;
 v_max_subtree integer;v_id uuid;
BEGIN
 IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 120
 THEN RAISE EXCEPTION 'Invalid folder name' USING ERRCODE='22023';END IF;
 IF NOT EXISTS(SELECT 1 FROM hollowgate_vtt.campaigns c
 JOIN hollowgate_auth.users u ON u.id=c.owner_id
 WHERE c.id=p_campaign AND c.owner_id=p_owner AND u.status='active'
 AND u.email_verified_at IS NOT NULL) THEN RETURN NULL;END IF;
 SELECT f.scope INTO v_scope FROM hollowgate_vtt.campaign_note_folders f
 WHERE f.id=p_folder AND f.campaign_id=p_campaign AND f.status='active' FOR UPDATE;
 IF v_scope IS NULL THEN RETURN NULL;END IF;
 WHILE v_at IS NOT NULL LOOP
  IF v_at=p_folder THEN RETURN NULL;END IF;
  v_depth:=v_depth+1;
  IF v_depth>5 THEN RETURN NULL;END IF;
  SELECT f.parent_folder_id INTO v_at FROM hollowgate_vtt.campaign_note_folders f
  WHERE f.id=v_at AND f.campaign_id=p_campaign AND f.scope=v_scope AND f.status='active';
  IF NOT FOUND THEN RETURN NULL;END IF;
 END LOOP;
 WITH RECURSIVE descendants AS (
   SELECT f.id,1 AS depth FROM hollowgate_vtt.campaign_note_folders f
   WHERE f.id=p_folder AND f.status='active'
   UNION ALL
   SELECT f.id,d.depth+1 FROM hollowgate_vtt.campaign_note_folders f
   JOIN descendants d ON f.parent_folder_id=d.id
   WHERE f.status='active' AND f.campaign_id=p_campaign AND f.scope=v_scope
 )
 SELECT max(depth) INTO v_max_subtree FROM descendants;
 IF v_depth+v_max_subtree-1>5 THEN RETURN NULL;END IF;
 UPDATE hollowgate_vtt.campaign_note_folders
 SET name=btrim(p_name),parent_folder_id=p_parent,updated_at=now()
 WHERE id=p_folder AND campaign_id=p_campaign AND status='active'
 RETURNING id INTO v_id;
 RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION hollowgate_vtt.list_member_note_folders(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.create_owned_note_folder(uuid,uuid,text,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.update_owned_note_folder(uuid,uuid,uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.list_member_note_folders(uuid,uuid,text) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.create_owned_note_folder(uuid,uuid,text,text,uuid) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.update_owned_note_folder(uuid,uuid,uuid,text,uuid) TO hollowgate_api_runtime;
COMMIT;
