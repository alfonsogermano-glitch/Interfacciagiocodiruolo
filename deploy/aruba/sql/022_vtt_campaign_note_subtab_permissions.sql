-- 022: Original NoteSubTabs visibility and per-parent editor ownership.
-- CI only. No UI activation, no direct table grants.
BEGIN;
CREATE OR REPLACE FUNCTION hollowgate_vtt.list_member_campaign_notes(
 p_user uuid,p_campaign uuid,p_parent uuid DEFAULT NULL)
RETURNS TABLE(id uuid,title text,content_rich jsonb,parent_note_id uuid,
 tab_position integer,visibility text)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 WITH access AS (
  SELECT hollowgate_vtt.campaign_member_role(p_user,p_campaign) AS member_role
 )
 SELECT n.id,n.title,n.content_rich,n.parent_note_id,n.position,n.visibility
 FROM hollowgate_vtt.campaign_notes n
 CROSS JOIN access a
 LEFT JOIN hollowgate_vtt.campaign_notes parent
  ON parent.id=n.parent_note_id AND parent.campaign_id=p_campaign
 WHERE n.campaign_id=p_campaign AND n.status='active'
  AND n.parent_note_id IS NOT DISTINCT FROM p_parent
  AND a.member_role IS NOT NULL
  AND (n.scope='shared' OR a.member_role='gm')
  AND (
   (p_parent IS NULL AND
    (n.visibility='all' OR n.creator_id=p_user OR a.member_role='gm'))
   OR
   (p_parent IS NOT NULL
    AND parent.id=p_parent AND parent.status='active'
    AND parent.parent_note_id IS NULL AND parent.scope=n.scope
    AND (parent.scope='shared' OR a.member_role='gm')
    AND (parent.visibility='all' OR parent.creator_id=p_user OR a.member_role='gm')
    -- The original editor grants child rights to the parent-note author,
    -- even if another GM created the particular subtab.
    AND (n.visibility='all' OR parent.creator_id=p_user OR a.member_role='gm'))
  )
 ORDER BY n.position,n.created_at,n.id LIMIT 100
$$;

-- Distinguish the factual subtab creator from the person who can edit it.
-- Original NoteSubTabs/EntityTabBar checks owner_profile_id per row.
-- For children this must be the parent creator; never forge creator_id.
-- PostgreSQL does not allow CREATE OR REPLACE to change RETURNS TABLE columns.
-- The 020 function has no SQL dependencies; reinstall it atomically here.
DROP FUNCTION hollowgate_vtt.list_member_campaign_notes_ui(uuid,uuid,uuid);
CREATE FUNCTION hollowgate_vtt.list_member_campaign_notes_ui(
 p_user uuid,p_campaign uuid,p_parent uuid DEFAULT NULL)
RETURNS TABLE(id uuid,title text,content_rich jsonb,parent_note_id uuid,
 tab_position integer,visibility text,scope text,folder_id uuid,
 creator_id uuid,updated_at timestamptz,editor_owner_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT visible.id,visible.title,visible.content_rich,visible.parent_note_id,
  visible.tab_position,visible.visibility,n.scope,n.folder_id,
  n.creator_id,n.updated_at,
  COALESCE(parent.creator_id,n.creator_id) AS editor_owner_id
 FROM hollowgate_vtt.list_member_campaign_notes(p_user,p_campaign,p_parent) visible
 JOIN hollowgate_vtt.campaign_notes n ON n.id=visible.id AND n.campaign_id=p_campaign
 LEFT JOIN hollowgate_vtt.campaign_notes parent
  ON parent.id=n.parent_note_id AND parent.campaign_id=p_campaign
 WHERE n.status='active'
$$;

REVOKE ALL ON FUNCTION hollowgate_vtt.list_member_campaign_notes_ui(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.list_member_campaign_notes_ui(uuid,uuid,uuid) TO hollowgate_api_runtime;
COMMIT;
