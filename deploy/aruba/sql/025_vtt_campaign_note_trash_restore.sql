-- 025: Recoverable Campaign Notes trash; irreversible purge is deliberately absent.
-- SQL SECURITY DEFINER routines authorize user and parent at read/write time.
BEGIN;
CREATE FUNCTION hollowgate_vtt.list_owned_campaign_trash(p_actor uuid,p_campaign uuid)
RETURNS TABLE(id uuid,item_type text,name text,scope text,parent_id uuid,archived_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 WITH authorized AS (
  SELECT c.id FROM hollowgate_vtt.campaigns c
  JOIN hollowgate_auth.users u ON u.id=c.owner_id
  WHERE c.id=p_campaign AND c.owner_id=p_actor AND u.status='active'
   AND u.email_verified_at IS NOT NULL
 )
 SELECT n.id,'note'::text,n.title,n.scope,n.parent_note_id,n.updated_at
 FROM hollowgate_vtt.campaign_notes n JOIN authorized a ON a.id=n.campaign_id
 WHERE n.status='archived'
 UNION ALL
 SELECT f.id,'folder'::text,f.name,f.scope,f.parent_folder_id,f.updated_at
 FROM hollowgate_vtt.campaign_note_folders f JOIN authorized a ON a.id=f.campaign_id
 WHERE f.status='archived'
 ORDER BY archived_at DESC,id LIMIT 1000
$$;

CREATE FUNCTION hollowgate_vtt.restore_owned_campaign_note(
 p_actor uuid,p_campaign uuid,p_note uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_id uuid;v_parent uuid;v_folder uuid;v_scope text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM hollowgate_vtt.campaigns c
  JOIN hollowgate_auth.users u ON u.id=c.owner_id
  WHERE c.id=p_campaign AND c.owner_id=p_actor AND u.status='active'
   AND u.email_verified_at IS NOT NULL) THEN RETURN NULL;END IF;
 SELECT n.id,n.parent_note_id,n.folder_id,n.scope
 INTO v_id,v_parent,v_folder,v_scope
 FROM hollowgate_vtt.campaign_notes n
 WHERE n.id=p_note AND n.campaign_id=p_campaign AND n.status='archived' FOR UPDATE;
 IF v_id IS NULL THEN RETURN NULL;END IF;
 IF v_parent IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM hollowgate_vtt.campaign_notes p
    WHERE p.id=v_parent AND p.campaign_id=p_campaign AND p.status='active'
     AND p.parent_note_id IS NULL AND p.scope=v_scope) THEN RETURN NULL;END IF;
  UPDATE hollowgate_vtt.campaign_notes SET status='active',visibility='private',
   updated_at=now() WHERE id=p_note AND campaign_id=p_campaign;
 ELSE
  -- Archive may have originated from a folder cascade; do not resurrect
  -- a reference to a still-archived or cross-scope folder.
  IF v_folder IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM hollowgate_vtt.campaign_note_folders f
   WHERE f.id=v_folder AND f.campaign_id=p_campaign
    AND f.scope=v_scope AND f.status='active'
  ) THEN v_folder:=NULL;END IF;
  UPDATE hollowgate_vtt.campaign_notes SET status='active',
   visibility='private',folder_id=v_folder,updated_at=now()
  WHERE id=p_note AND campaign_id=p_campaign;
  -- Recover children that were archived along with the root. Do not
  -- change their content, author, inherited section or title icon.
  UPDATE hollowgate_vtt.campaign_notes SET status='active',
   visibility='private',updated_at=now()
  WHERE campaign_id=p_campaign AND parent_note_id=p_note AND status='archived'
   AND scope=v_scope;
 END IF;
 RETURN v_id;
END $$;

CREATE FUNCTION hollowgate_vtt.restore_owned_note_folder(
 p_actor uuid,p_campaign uuid,p_folder uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_id uuid;v_parent uuid;v_scope text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM hollowgate_vtt.campaigns c
  JOIN hollowgate_auth.users u ON u.id=c.owner_id
  WHERE c.id=p_campaign AND c.owner_id=p_actor AND u.status='active'
   AND u.email_verified_at IS NOT NULL) THEN RETURN NULL;END IF;
 SELECT f.id,f.parent_folder_id,f.scope INTO v_id,v_parent,v_scope
 FROM hollowgate_vtt.campaign_note_folders f
 WHERE f.id=p_folder AND f.campaign_id=p_campaign AND f.status='archived' FOR UPDATE;
 IF v_id IS NULL THEN RETURN NULL;END IF;
 -- When the original parent is still archived, restore as a root folder.
 -- Never attach it to another scope or an active folder of another campaign.
 IF v_parent IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM hollowgate_vtt.campaign_note_folders f
  WHERE f.id=v_parent AND f.campaign_id=p_campaign
   AND f.scope=v_scope AND f.status='active'
 ) THEN v_parent:=NULL;END IF;
 UPDATE hollowgate_vtt.campaign_note_folders
 SET status='active',parent_folder_id=v_parent,updated_at=now()
 WHERE id=p_folder AND campaign_id=p_campaign;
 -- Descendant folders/notes remain archived until separately restored,
 -- avoiding accidental resurrection of objects archived beforehand.
 RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION hollowgate_vtt.list_owned_campaign_trash(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.restore_owned_campaign_note(uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.restore_owned_note_folder(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.list_owned_campaign_trash(uuid,uuid) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.restore_owned_campaign_note(uuid,uuid,uuid) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.restore_owned_note_folder(uuid,uuid,uuid) TO hollowgate_api_runtime;
COMMIT;
