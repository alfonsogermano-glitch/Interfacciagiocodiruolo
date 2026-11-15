-- 019: Folder presentation and recoverable archive, CI-only.
-- Never hard-delete folders, notes or TipTap documents.
BEGIN;
CREATE FUNCTION hollowgate_vtt.set_owned_note_folder_presentation(
 p_owner uuid,p_campaign uuid,p_folder uuid,p_icon text,p_position integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
 IF (p_icon IS NOT NULL AND (length(p_icon)>80))
  OR p_position IS NULL OR p_position NOT BETWEEN 0 AND 10000 THEN
  RAISE EXCEPTION 'Invalid folder presentation' USING ERRCODE='22023';END IF;
 UPDATE hollowgate_vtt.campaign_note_folders f
 SET icon=p_icon,position=p_position,updated_at=now()
 FROM hollowgate_vtt.campaigns c,hollowgate_auth.users u
 WHERE f.id=p_folder AND f.campaign_id=p_campaign AND f.status='active'
  AND c.id=p_campaign AND c.owner_id=p_owner AND u.id=p_owner
  AND u.status='active' AND u.email_verified_at IS NOT NULL
 RETURNING f.id INTO v_id;
 RETURN v_id;
END $$;

-- Cascade archives the entire folder tree and the Notes inside it;
-- children of archived note containers are archived too.
-- Non-cascade archives only the folder and preserves its notes/subfolders:
-- notes detach to root, direct child folders move up one level.
CREATE FUNCTION hollowgate_vtt.archive_owned_note_folder(
 p_owner uuid,p_campaign uuid,p_folder uuid,p_cascade boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_parent uuid;v_scope text;v_id uuid;
BEGIN
 IF p_cascade IS NULL THEN
  RAISE EXCEPTION 'Cascade choice required' USING ERRCODE='22023';END IF;
 IF NOT EXISTS(SELECT 1 FROM hollowgate_vtt.campaigns c
  JOIN hollowgate_auth.users u ON u.id=c.owner_id
  WHERE c.id=p_campaign AND c.owner_id=p_owner AND u.status='active'
   AND u.email_verified_at IS NOT NULL) THEN RETURN NULL;END IF;
 SELECT f.id,f.parent_folder_id,f.scope INTO v_id,v_parent,v_scope
 FROM hollowgate_vtt.campaign_note_folders f
 WHERE f.id=p_folder AND f.campaign_id=p_campaign AND f.status='active'
 FOR UPDATE;
 IF v_id IS NULL THEN RETURN NULL;END IF;
 IF p_cascade THEN
  -- Materialize IDs once so the subsequent mutations cannot change traversal.
  WITH RECURSIVE subtree(id) AS (
   SELECT f.id FROM hollowgate_vtt.campaign_note_folders f
   WHERE f.id=p_folder AND f.campaign_id=p_campaign AND f.status='active'
   UNION ALL
   SELECT f.id FROM hollowgate_vtt.campaign_note_folders f
   JOIN subtree s ON f.parent_folder_id=s.id
   WHERE f.campaign_id=p_campaign AND f.scope=v_scope AND f.status='active'
  ), archived_notes AS (
   UPDATE hollowgate_vtt.campaign_notes n
   SET status='archived',updated_at=now()
   WHERE n.campaign_id=p_campaign AND n.status='active'
    AND (n.id IN (
      SELECT p.id FROM hollowgate_vtt.campaign_notes p
      WHERE p.campaign_id=p_campaign AND p.status='active'
       AND p.parent_note_id IS NULL AND p.folder_id IN(SELECT id FROM subtree)
    ) OR n.parent_note_id IN (
      SELECT p.id FROM hollowgate_vtt.campaign_notes p
      WHERE p.campaign_id=p_campaign AND p.status='active'
       AND p.parent_note_id IS NULL AND p.folder_id IN(SELECT id FROM subtree)
    ))
   RETURNING n.id
  )
  UPDATE hollowgate_vtt.campaign_note_folders f
  SET status='archived',updated_at=now()
  WHERE f.id IN (SELECT id FROM subtree);
 ELSE
  UPDATE hollowgate_vtt.campaign_notes n SET folder_id=NULL,updated_at=now()
  WHERE n.campaign_id=p_campaign AND n.folder_id=p_folder AND n.status='active';
  UPDATE hollowgate_vtt.campaign_note_folders f
  SET parent_folder_id=v_parent,updated_at=now()
  WHERE f.campaign_id=p_campaign AND f.parent_folder_id=p_folder
   AND f.scope=v_scope AND f.status='active';
  UPDATE hollowgate_vtt.campaign_note_folders f
  SET status='archived',updated_at=now()
  WHERE f.id=p_folder AND f.campaign_id=p_campaign AND f.status='active';
 END IF;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION hollowgate_vtt.set_owned_note_folder_presentation(uuid,uuid,uuid,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.archive_owned_note_folder(uuid,uuid,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.set_owned_note_folder_presentation(uuid,uuid,uuid,text,integer) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.archive_owned_note_folder(uuid,uuid,uuid,boolean) TO hollowgate_api_runtime;
COMMIT;
