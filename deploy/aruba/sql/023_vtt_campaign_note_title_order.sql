-- 023: Persist original NoteListRow icons and NoteSubTabs drag order.
-- All writes use campaign-scoped GM/parent-author authorization. CI only.
BEGIN;
ALTER TABLE hollowgate_vtt.campaign_notes
 ADD COLUMN title_icon text CHECK (title_icon IS NULL OR length(title_icon) BETWEEN 1 AND 80),
 ADD COLUMN tab_order jsonb CHECK (
  tab_order IS NULL OR (jsonb_typeof(tab_order)='array' AND jsonb_array_length(tab_order)<=100)
 );

CREATE FUNCTION hollowgate_vtt.set_member_campaign_note_title_icon(
 p_actor uuid,p_campaign uuid,p_note uuid,p_icon text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_role text;v_id uuid;
BEGIN
 IF p_icon IS NOT NULL AND (length(p_icon) NOT BETWEEN 1 AND 80)
 THEN RAISE EXCEPTION 'Invalid Note title icon' USING ERRCODE='22023';END IF;
 v_role:=hollowgate_vtt.campaign_member_role(p_actor,p_campaign);
 IF v_role IS NULL THEN RETURN NULL;END IF;
 UPDATE hollowgate_vtt.campaign_notes n
 SET title_icon=p_icon,updated_at=now()
 WHERE n.id=p_note AND n.campaign_id=p_campaign AND n.status='active'
  AND n.parent_note_id IS NULL
  AND (n.scope='shared' OR v_role='gm')
  AND (v_role='gm' OR n.creator_id=p_actor)
 RETURNING n.id INTO v_id;
 RETURN v_id;
END $$;

CREATE FUNCTION hollowgate_vtt.set_member_campaign_subtab_order(
 p_actor uuid,p_campaign uuid,p_parent uuid,p_order jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_role text;v_id uuid;v_expected integer;v_total integer;v_unique integer;
BEGIN
 IF p_order IS NULL OR jsonb_typeof(p_order)<>'array'
 THEN RAISE EXCEPTION 'Subtab order must be an array' USING ERRCODE='22023';END IF;
 IF jsonb_array_length(p_order)>100
 THEN RAISE EXCEPTION 'Too many subtabs' USING ERRCODE='22023';END IF;
 IF EXISTS(
  SELECT 1 FROM jsonb_array_elements(p_order) item
  WHERE jsonb_typeof(item.value)<>'string'
   OR item.value #>> '{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 ) THEN RAISE EXCEPTION 'Invalid subtab id' USING ERRCODE='22023';END IF;

 v_role:=hollowgate_vtt.campaign_member_role(p_actor,p_campaign);
 IF v_role IS NULL THEN RETURN NULL;END IF;
 SELECT n.id INTO v_id FROM hollowgate_vtt.campaign_notes n
 WHERE n.id=p_parent AND n.campaign_id=p_campaign AND n.status='active'
  AND n.parent_note_id IS NULL
  AND (n.scope='shared' OR v_role='gm')
  AND (v_role='gm' OR n.creator_id=p_actor)
 FOR UPDATE;
 IF v_id IS NULL THEN RETURN NULL;END IF;
 SELECT count(*) INTO v_expected FROM hollowgate_vtt.campaign_notes n
 WHERE n.campaign_id=p_campaign AND n.parent_note_id=p_parent AND n.status='active';
 SELECT count(*),count(DISTINCT x.id) INTO v_total,v_unique
 FROM jsonb_array_elements_text(p_order) x(id);
 IF v_expected<>v_total OR v_total<>v_unique OR EXISTS(
  SELECT 1 FROM jsonb_array_elements_text(p_order) x(id)
  WHERE NOT EXISTS (
   SELECT 1 FROM hollowgate_vtt.campaign_notes n
   WHERE n.id::text=x.id AND n.campaign_id=p_campaign
    AND n.parent_note_id=p_parent AND n.status='active'
  )
 ) THEN RAISE EXCEPTION 'Subtab order does not match active children' USING ERRCODE='22023';END IF;
 UPDATE hollowgate_vtt.campaign_notes n SET tab_order=p_order,updated_at=now()
 WHERE n.id=p_parent AND n.campaign_id=p_campaign;
 RETURN v_id;
END $$;

-- 022 UI reader has a fixed RETURNS TABLE. Reinstall atomically after
-- adding title_icon/tab_order rather than leaving the original panel blind.
DROP FUNCTION hollowgate_vtt.list_member_campaign_notes_ui(uuid,uuid,uuid);
CREATE FUNCTION hollowgate_vtt.list_member_campaign_notes_ui(
 p_user uuid,p_campaign uuid,p_parent uuid DEFAULT NULL)
RETURNS TABLE(id uuid,title text,content_rich jsonb,parent_note_id uuid,
 tab_position integer,visibility text,scope text,folder_id uuid,
 creator_id uuid,updated_at timestamptz,editor_owner_id uuid,
 title_icon text,tab_order jsonb)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT visible.id,visible.title,visible.content_rich,visible.parent_note_id,
  visible.tab_position,visible.visibility,n.scope,n.folder_id,
  n.creator_id,n.updated_at,COALESCE(parent.creator_id,n.creator_id),
  n.title_icon,n.tab_order
 FROM hollowgate_vtt.list_member_campaign_notes(p_user,p_campaign,p_parent) visible
 JOIN hollowgate_vtt.campaign_notes n ON n.id=visible.id AND n.campaign_id=p_campaign
 LEFT JOIN hollowgate_vtt.campaign_notes parent
  ON parent.id=n.parent_note_id AND parent.campaign_id=p_campaign
 WHERE n.status='active'
$$;

REVOKE ALL ON FUNCTION hollowgate_vtt.set_member_campaign_note_title_icon(uuid,uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.set_member_campaign_subtab_order(uuid,uuid,uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.list_member_campaign_notes_ui(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.set_member_campaign_note_title_icon(uuid,uuid,uuid,text) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.set_member_campaign_subtab_order(uuid,uuid,uuid,jsonb) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.list_member_campaign_notes_ui(uuid,uuid,uuid) TO hollowgate_api_runtime;
COMMIT;
