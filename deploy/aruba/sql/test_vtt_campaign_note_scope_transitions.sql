BEGIN;
DO $$
DECLARE owner uuid:=gen_random_uuid();gm uuid:=gen_random_uuid();
 player uuid:=gen_random_uuid();other uuid:=gen_random_uuid();
 c uuid;foreign_c uuid;shared_note uuid;gm_note uuid;child uuid;dir uuid;
 v uuid;n integer;
BEGIN
 INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source)
 VALUES(owner,'scope24-owner@example.org','Owner','active',now(),'local'),
 (gm,'scope24-gm@example.org','GM','active',now(),'local'),
 (player,'scope24-player@example.org','Player','active',now(),'local'),
 (other,'scope24-other@example.org','Other','active',now(),'local');
 SELECT hollowgate_vtt.create_owned_campaign(owner,'Scope Test','','hsc') INTO c;
 SELECT hollowgate_vtt.create_owned_campaign(other,'Foreign','','hsc') INTO foreign_c;
 SELECT hollowgate_vtt.set_campaign_membership(owner,c,gm,'gm',true) INTO v;
 SELECT hollowgate_vtt.set_campaign_membership(owner,c,player,'player',true) INTO v;
 SELECT hollowgate_vtt.create_member_campaign_note(gm,c,'Shared root',NULL,'shared') INTO shared_note;
 SELECT hollowgate_vtt.create_member_campaign_note(gm,c,'Visible child',shared_note,NULL) INTO child;
 SELECT hollowgate_vtt.save_member_campaign_note(gm,c,shared_note,'Shared root',NULL,0,'all') INTO v;
 SELECT hollowgate_vtt.save_member_campaign_note(gm,c,child,'Visible child',
  '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,0,'all') INTO v;
 SELECT hollowgate_vtt.create_owned_note_folder(owner,c,'shared','Folder',NULL) INTO dir;
 SELECT hollowgate_vtt.assign_member_campaign_note_folder(gm,c,shared_note,dir) INTO v;
 SELECT hollowgate_vtt.create_member_campaign_note(gm,c,'Original GM note',NULL,'gm') INTO gm_note;
 SELECT hollowgate_vtt.move_gm_campaign_note_scope(player,c,shared_note,'gm') INTO v;
 IF v IS NOT NULL THEN RAISE EXCEPTION 'Player hid Note in GM section';END IF;
 SELECT hollowgate_vtt.move_gm_campaign_note_scope(other,c,shared_note,'gm') INTO v;
 IF v IS NOT NULL THEN RAISE EXCEPTION 'Outsider changed section';END IF;
 SELECT hollowgate_vtt.move_gm_campaign_note_scope(gm,foreign_c,shared_note,'gm') INTO v;
 IF v IS NOT NULL THEN RAISE EXCEPTION 'Cross-campaign move';END IF;
 SELECT hollowgate_vtt.move_gm_campaign_note_scope(gm,c,child,'gm') INTO v;
 IF v IS NOT NULL THEN RAISE EXCEPTION 'Nested tab moved independently';END IF;
 SELECT hollowgate_vtt.move_gm_campaign_note_scope(gm,c,shared_note,'gm') INTO v;
 IF v IS DISTINCT FROM shared_note THEN RAISE EXCEPTION 'GM hide failed';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.campaign_notes
 WHERE id IN(shared_note,child) AND scope='gm' AND visibility='private';
 IF n<>2 THEN RAISE EXCEPTION 'Scope/visibility not changed for subtree';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.campaign_notes
 WHERE id=shared_note AND folder_id IS NULL;
 IF n<>1 THEN RAISE EXCEPTION 'Incompatible folder retained';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_member_campaign_notes_ui(player,c,NULL)
 WHERE id=shared_note;
 IF n<>0 THEN RAISE EXCEPTION 'GM root leaked after hide';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_member_campaign_notes_ui(player,c,shared_note);
 IF n<>0 THEN RAISE EXCEPTION 'GM child leaked after hide';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_member_campaign_notes_ui(gm,c,NULL)
 WHERE id=shared_note;
 IF n<>1 THEN RAISE EXCEPTION 'GM lost private root';END IF;
 SELECT hollowgate_vtt.move_gm_campaign_note_scope(gm,c,shared_note,'shared') INTO v;
 IF v IS DISTINCT FROM shared_note THEN RAISE EXCEPTION 'GM show failed';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_member_campaign_notes_ui(player,c,NULL)
 WHERE id=shared_note;
 IF n<>0 THEN RAISE EXCEPTION 'Previously GM content exposed on Show';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.campaign_notes
 WHERE id=child AND content_rich->>'type'='doc' AND visibility='private';
 IF n<>1 THEN RAISE EXCEPTION 'TipTap content corrupted during move';END IF;
 SELECT hollowgate_vtt.save_member_campaign_note(gm,c,shared_note,'Shared root',NULL,0,'all') INTO v;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_member_campaign_notes_ui(player,c,NULL)
 WHERE id=shared_note;
 IF n<>1 THEN RAISE EXCEPTION 'GM cannot explicitly publish afterwards';END IF;
 SELECT hollowgate_vtt.set_campaign_membership(owner,c,gm,'gm',false) INTO v;
 SELECT hollowgate_vtt.move_gm_campaign_note_scope(gm,c,shared_note,'gm') INTO v;
 IF v IS NOT NULL THEN RAISE EXCEPTION 'Revoked GM can change section';END IF;
 IF has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.campaign_notes','UPDATE')
 THEN RAISE EXCEPTION 'Runtime obtained direct Note UPDATE';END IF;
END $$;
ROLLBACK;
