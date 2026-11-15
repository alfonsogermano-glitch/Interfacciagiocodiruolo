-- 018: Link original campaign Note containers to folders with server-side scope.
-- Postgres disposable CI ONLY; neither VPS migration nor browser activation.
BEGIN;
ALTER TABLE hollowgate_vtt.campaign_notes
 ADD COLUMN scope text NOT NULL DEFAULT 'shared'
  CHECK(scope IN ('gm','shared')),
 ADD COLUMN folder_id uuid REFERENCES hollowgate_vtt.campaign_note_folders(id)
  ON DELETE RESTRICT,
 ADD CONSTRAINT only_root_notes_have_folders
  CHECK(folder_id IS NULL OR parent_note_id IS NULL);
CREATE INDEX campaign_note_folder_lookup
 ON hollowgate_vtt.campaign_notes(campaign_id,scope,folder_id,status,position);

-- Original NoteSubTabs are leaves and inherit their parent's section.
CREATE FUNCTION hollowgate_vtt.campaign_note_inherit_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF NEW.parent_note_id IS NOT NULL THEN
  SELECT p.scope INTO NEW.scope FROM hollowgate_vtt.campaign_notes p
  WHERE p.id=NEW.parent_note_id AND p.campaign_id=NEW.campaign_id
   AND p.status='active' AND p.parent_note_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid parent note' USING ERRCODE='23514';END IF;
  NEW.folder_id:=NULL;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER campaign_note_scope_insert
 BEFORE INSERT ON hollowgate_vtt.campaign_notes
 FOR EACH ROW EXECUTE FUNCTION hollowgate_vtt.campaign_note_inherit_scope();

-- Scope is assigned only by trusted owner-scoped root creation;
-- child creation continues to inherit scope via the INSERT trigger.
CREATE FUNCTION hollowgate_vtt.create_owned_campaign_note_scoped(
 p_owner uuid,p_campaign uuid,p_title text,p_scope text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
 IF p_scope IS NULL OR p_scope NOT IN ('shared','gm') THEN
  RAISE EXCEPTION 'Invalid Note scope' USING ERRCODE='22023';END IF;
 SELECT hollowgate_vtt.create_owned_campaign_note(p_owner,p_campaign,p_title,NULL)
 INTO v_id;
 IF v_id IS NULL THEN RETURN NULL;END IF;
 UPDATE hollowgate_vtt.campaign_notes SET scope=p_scope WHERE id=v_id AND campaign_id=p_campaign;
 RETURN v_id;
END $$;

-- Store root notes in folders belonging to the SAME campaign and section.
-- Never authorize a player to move someone else's notes.
CREATE FUNCTION hollowgate_vtt.assign_owned_campaign_note_folder(
 p_owner uuid,p_campaign uuid,p_note uuid,p_folder uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
 UPDATE hollowgate_vtt.campaign_notes n SET folder_id=p_folder,updated_at=now()
 FROM hollowgate_vtt.campaigns c,hollowgate_auth.users u
 WHERE n.id=p_note AND n.campaign_id=p_campaign
  AND n.parent_note_id IS NULL AND n.status='active'
  AND c.id=p_campaign AND c.owner_id=p_owner
  AND u.id=p_owner AND u.status='active' AND u.email_verified_at IS NOT NULL
  AND (p_folder IS NULL OR EXISTS(
   SELECT 1 FROM hollowgate_vtt.campaign_note_folders f
   WHERE f.id=p_folder AND f.campaign_id=p_campaign
    AND f.scope=n.scope AND f.status='active'))
 RETURNING n.id INTO v_id;
 RETURN v_id;
END $$;

-- Important: the earlier reader from 016 did not know about GM-only notes.
-- Preserve its return type but make scope exclusion part of SQL authorization.
CREATE OR REPLACE FUNCTION hollowgate_vtt.list_member_campaign_notes(
 p_user uuid,p_campaign uuid,p_parent uuid DEFAULT NULL)
RETURNS TABLE(id uuid,title text,content_rich jsonb,parent_note_id uuid,
 tab_position integer,visibility text)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 WITH role_access AS (
  SELECT hollowgate_vtt.campaign_member_role(p_user,p_campaign) AS member_role,
         c.owner_id FROM hollowgate_vtt.campaigns c WHERE c.id=p_campaign
 )
 SELECT n.id,n.title,n.content_rich,n.parent_note_id,n.position,n.visibility
 FROM hollowgate_vtt.campaign_notes n
 CROSS JOIN role_access a
 LEFT JOIN hollowgate_vtt.campaign_notes parent ON parent.id=n.parent_note_id
 WHERE n.campaign_id=p_campaign AND n.status='active'
  AND n.parent_note_id IS NOT DISTINCT FROM p_parent
  AND a.member_role IS NOT NULL
  AND (n.scope='shared' OR a.member_role='gm')
  AND (n.visibility='all' OR n.creator_id=p_user OR a.owner_id=p_user)
  AND (p_parent IS NULL OR
   (parent.id=p_parent AND parent.campaign_id=p_campaign
    AND parent.parent_note_id IS NULL AND parent.status='active'
    AND parent.scope=n.scope
    AND (parent.scope='shared' OR a.member_role='gm')
    AND (parent.visibility='all' OR parent.creator_id=p_user OR a.owner_id=p_user)))
 ORDER BY n.position,n.created_at,n.id LIMIT 100
$$;

-- Safe wrapper: only IDs already granted by 018-filtered member reader
-- can reveal additional folder/scope information to API clients.
CREATE FUNCTION hollowgate_vtt.list_member_campaign_notes_with_folders(
 p_user uuid,p_campaign uuid,p_parent uuid DEFAULT NULL)
RETURNS TABLE(id uuid,title text,content_rich jsonb,parent_note_id uuid,
 tab_position integer,visibility text,scope text,folder_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT visible.id,visible.title,visible.content_rich,visible.parent_note_id,
 visible.tab_position,visible.visibility,n.scope,n.folder_id
 FROM hollowgate_vtt.list_member_campaign_notes(p_user,p_campaign,p_parent) visible
 JOIN hollowgate_vtt.campaign_notes n ON n.id=visible.id AND n.campaign_id=p_campaign
$$;

REVOKE ALL ON FUNCTION hollowgate_vtt.create_owned_campaign_note_scoped(uuid,uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.assign_owned_campaign_note_folder(uuid,uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.list_member_campaign_notes_with_folders(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.create_owned_campaign_note_scoped(uuid,uuid,text,text) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.assign_owned_campaign_note_folder(uuid,uuid,uuid,uuid) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.list_member_campaign_notes_with_folders(uuid,uuid,uuid) TO hollowgate_api_runtime;
COMMIT;
