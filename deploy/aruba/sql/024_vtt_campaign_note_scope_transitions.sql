-- 024: Atomic GM-only transition of original campaign Note sections.
-- CI disposable PostgreSQL only; never run on production until UI is ready.
BEGIN;
CREATE FUNCTION hollowgate_vtt.move_gm_campaign_note_scope(
 p_actor uuid,p_campaign uuid,p_note uuid,p_target text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_id uuid;v_current text;
BEGIN
 IF p_target IS NULL OR p_target NOT IN ('shared','gm') THEN
  RAISE EXCEPTION 'Invalid target Note section' USING ERRCODE='22023';END IF;
 IF hollowgate_vtt.campaign_member_role(p_actor,p_campaign) IS DISTINCT FROM 'gm'
 THEN RETURN NULL;END IF;
 SELECT n.id,n.scope INTO v_id,v_current FROM hollowgate_vtt.campaign_notes n
 WHERE n.id=p_note AND n.campaign_id=p_campaign AND n.status='active'
  AND n.parent_note_id IS NULL FOR UPDATE;
 IF v_id IS NULL THEN RETURN NULL;END IF;
 IF v_current=p_target THEN RETURN v_id;END IF;
 -- Switching GM/shared always detaches the incompatible folder. The
 -- transition makes BOTH the parent and all active children private:
 -- "Show" cannot accidentally expose previously secret TipTap documents.
 UPDATE hollowgate_vtt.campaign_notes n
 SET scope=p_target, visibility='private',folder_id=NULL,updated_at=now()
 WHERE n.id=p_note AND n.campaign_id=p_campaign AND n.status='active';
 UPDATE hollowgate_vtt.campaign_notes child
 SET scope=p_target,visibility='private',updated_at=now()
 WHERE child.campaign_id=p_campaign AND child.parent_note_id=p_note AND child.status='active';
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION hollowgate_vtt.move_gm_campaign_note_scope(uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.move_gm_campaign_note_scope(uuid,uuid,uuid,text) TO hollowgate_api_runtime;
COMMIT;
