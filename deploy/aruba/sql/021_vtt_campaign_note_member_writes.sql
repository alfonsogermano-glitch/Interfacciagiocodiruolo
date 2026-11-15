-- 021: Per-note writes for campaign GM and authors, SQL-authorized per session identity.
-- CI ONLY; no production migration or feature activation.
BEGIN;
CREATE FUNCTION hollowgate_vtt.create_member_campaign_note(
 p_actor uuid,p_campaign uuid,p_title text,p_parent uuid,p_scope text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_role text;v_scope text;v_parent_author uuid;v_id uuid;v_position integer;v_visibility text;
BEGIN
 IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 120
  OR (p_parent IS NULL AND (p_scope IS NULL OR p_scope NOT IN ('gm','shared')))
  OR (p_parent IS NOT NULL AND p_scope IS NOT NULL)
 THEN RAISE EXCEPTION 'Invalid campaign Note' USING ERRCODE='22023';END IF;
 v_role:=hollowgate_vtt.campaign_member_role(p_actor,p_campaign);
 IF v_role IS NULL THEN RETURN NULL;END IF;
 IF p_parent IS NOT NULL THEN
  SELECT n.scope,n.creator_id INTO v_scope,v_parent_author
  FROM hollowgate_vtt.campaign_notes n
  WHERE n.id=p_parent AND n.campaign_id=p_campaign AND n.status='active'
   AND n.parent_note_id IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL;END IF;
  IF (v_scope='gm' AND v_role<>'gm') OR
     (v_role<>'gm' AND v_parent_author<>p_actor) THEN RETURN NULL;END IF;
 ELSE
  v_scope:=p_scope;
  IF v_scope='gm' AND v_role<>'gm' THEN RETURN NULL;END IF;
 END IF;
 SELECT count(*) INTO v_position FROM hollowgate_vtt.campaign_notes n
 WHERE n.campaign_id=p_campaign AND n.status='active'
  AND n.parent_note_id IS NOT DISTINCT FROM p_parent;
 IF v_position>=100 THEN RAISE EXCEPTION 'Too many campaign Notes' USING ERRCODE='22023';END IF;
 IF p_parent IS NOT NULL THEN
  SELECT p.visibility INTO v_visibility FROM hollowgate_vtt.campaign_notes p WHERE p.id=p_parent;
 ELSE
  v_visibility:=CASE WHEN v_scope='gm' THEN 'private' ELSE 'all' END;
 END IF;
 INSERT INTO hollowgate_vtt.campaign_notes(
  campaign_id,creator_id,parent_note_id,title,position,scope,visibility)
 VALUES(p_campaign,p_actor,p_parent,btrim(p_title),v_position,v_scope,v_visibility)
 RETURNING id INTO v_id;
 RETURN v_id;
END $$;

CREATE FUNCTION hollowgate_vtt.save_member_campaign_note(
 p_actor uuid,p_campaign uuid,p_note uuid,p_title text,
 p_rich jsonb,p_position integer,p_visibility text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_role text;v_id uuid;
BEGIN
 IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 120
 OR (p_rich IS NOT NULL AND (jsonb_typeof(p_rich)<>'object' OR octet_length(p_rich::text)>49152))
 OR p_position IS NULL OR p_position NOT BETWEEN 0 AND 10000
 OR p_visibility IS NULL OR p_visibility NOT IN ('private','all')
 THEN RAISE EXCEPTION 'Invalid campaign Note data' USING ERRCODE='22023';END IF;
 v_role:=hollowgate_vtt.campaign_member_role(p_actor,p_campaign);
 IF v_role IS NULL THEN RETURN NULL;END IF;
 UPDATE hollowgate_vtt.campaign_notes n
 SET title=btrim(p_title),content_rich=p_rich,position=p_position,
  visibility=p_visibility,updated_at=now()
 WHERE n.id=p_note AND n.campaign_id=p_campaign AND n.status='active'
  AND (n.scope='shared' OR v_role='gm')
  AND (v_role='gm' OR (n.scope='shared' AND (
   (n.parent_note_id IS NULL AND n.creator_id=p_actor) OR
   (n.parent_note_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM hollowgate_vtt.campaign_notes p
    WHERE p.id=n.parent_note_id AND p.campaign_id=p_campaign
     AND p.status='active' AND p.parent_note_id IS NULL
     AND p.scope=n.scope AND p.creator_id=p_actor)))))
  AND (n.parent_note_id IS NULL OR EXISTS(
   SELECT 1 FROM hollowgate_vtt.campaign_notes p
   WHERE p.id=n.parent_note_id AND p.campaign_id=p_campaign
    AND p.status='active' AND p.parent_note_id IS NULL
    AND p.scope=n.scope))
 RETURNING n.id INTO v_id;
 RETURN v_id;
END $$;

CREATE FUNCTION hollowgate_vtt.archive_member_campaign_note(
 p_actor uuid,p_campaign uuid,p_note uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_role text;v_id uuid;v_scope text;v_creator uuid;v_parent uuid;
BEGIN
 v_role:=hollowgate_vtt.campaign_member_role(p_actor,p_campaign);
 IF v_role IS NULL THEN RETURN NULL;END IF;
 SELECT n.id,n.scope,n.creator_id,n.parent_note_id
 INTO v_id,v_scope,v_creator,v_parent
 FROM hollowgate_vtt.campaign_notes n
 WHERE n.id=p_note AND n.campaign_id=p_campaign AND n.status='active'
 FOR UPDATE;
 IF v_id IS NULL OR (v_scope='gm' AND v_role<>'gm') THEN RETURN NULL;END IF;
 IF v_parent IS NULL AND v_role<>'gm' AND v_creator<>p_actor THEN RETURN NULL;END IF;
 IF v_parent IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM hollowgate_vtt.campaign_notes p
  WHERE p.id=v_parent AND p.campaign_id=p_campaign
   AND p.status='active' AND p.parent_note_id IS NULL AND p.scope=v_scope
   AND (v_role='gm' OR p.creator_id=p_actor)
 ) THEN RETURN NULL;END IF;
 -- Archive a root with its children, or just the addressed leaf.
 UPDATE hollowgate_vtt.campaign_notes n
 SET status='archived',updated_at=now()
 WHERE n.campaign_id=p_campaign AND n.status='active'
  AND (n.id=p_note OR (v_parent IS NULL AND n.parent_note_id=p_note));
 RETURN v_id;
END $$;

-- Unlike the old owner-only RPC, a creator can organize their own shared Note.
-- GM can organize any Note; nobody can move across scopes or campaigns.
CREATE FUNCTION hollowgate_vtt.assign_member_campaign_note_folder(
 p_actor uuid,p_campaign uuid,p_note uuid,p_folder uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_role text;v_id uuid;
BEGIN
 v_role:=hollowgate_vtt.campaign_member_role(p_actor,p_campaign);
 IF v_role IS NULL THEN RETURN NULL;END IF;
 UPDATE hollowgate_vtt.campaign_notes n
 SET folder_id=p_folder,updated_at=now()
 WHERE n.id=p_note AND n.campaign_id=p_campaign AND n.parent_note_id IS NULL
  AND n.status='active' AND (n.scope='shared' OR v_role='gm')
  AND (v_role='gm' OR (n.scope='shared' AND n.creator_id=p_actor))
  AND (p_folder IS NULL OR EXISTS(
   SELECT 1 FROM hollowgate_vtt.campaign_note_folders f
   WHERE f.id=p_folder AND f.campaign_id=p_campaign AND f.scope=n.scope AND f.status='active'
  ))
 RETURNING n.id INTO v_id;
 RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION hollowgate_vtt.create_member_campaign_note(uuid,uuid,text,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.save_member_campaign_note(uuid,uuid,uuid,text,jsonb,integer,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.archive_member_campaign_note(uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.assign_member_campaign_note_folder(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.create_member_campaign_note(uuid,uuid,text,uuid,text) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.save_member_campaign_note(uuid,uuid,uuid,text,jsonb,integer,text) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.archive_member_campaign_note(uuid,uuid,uuid) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.assign_member_campaign_note_folder(uuid,uuid,uuid,uuid) TO hollowgate_api_runtime;
COMMIT;
