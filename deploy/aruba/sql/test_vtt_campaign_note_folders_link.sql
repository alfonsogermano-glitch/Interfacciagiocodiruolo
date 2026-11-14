BEGIN;
DO $$
DECLARE owner uuid:=gen_random_uuid();player uuid:=gen_random_uuid();
 gm uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();
 campaign uuid;other_campaign uuid;shared_folder uuid;gm_folder uuid;external_folder uuid;
 shared_root uuid;gm_root uuid;gm_child uuid;answer uuid;n integer;
BEGIN
 INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source)
 VALUES(owner,'note-folder-owner@example.org','Owner','active',now(),'local'),
 (player,'note-folder-player@example.org','Player','active',now(),'local'),
 (gm,'note-folder-gm@example.org','GM','active',now(),'local'),
 (outsider,'note-folder-outsider@example.org','Outsider','active',now(),'local');
 SELECT hollowgate_vtt.create_owned_campaign(owner,'Notes Folders','','hsc') INTO campaign;
 SELECT hollowgate_vtt.create_owned_campaign(outsider,'Another Campaign','','hsc') INTO other_campaign;
 SELECT hollowgate_vtt.set_campaign_membership(owner,campaign,player,'player',true) INTO answer;
 SELECT hollowgate_vtt.set_campaign_membership(owner,campaign,gm,'gm',true) INTO answer;
 SELECT hollowgate_vtt.create_owned_note_folder(owner,campaign,'shared','Public folder',NULL) INTO shared_folder;
 SELECT hollowgate_vtt.create_owned_note_folder(owner,campaign,'gm','Private GM folder',NULL) INTO gm_folder;
 SELECT hollowgate_vtt.create_owned_note_folder(outsider,other_campaign,'shared','External',NULL) INTO external_folder;
 SELECT hollowgate_vtt.create_owned_campaign_note_scoped(owner,campaign,'Shared note','shared') INTO shared_root;
 SELECT hollowgate_vtt.create_owned_campaign_note_scoped(owner,campaign,'GM note','gm') INTO gm_root;
 SELECT hollowgate_vtt.create_owned_campaign_note(owner,campaign,'GM child',gm_root) INTO gm_child;
 IF gm_root IS NULL OR shared_root IS NULL OR gm_child IS NULL THEN
  RAISE EXCEPTION 'Scoped note creation failed';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.campaign_notes
 WHERE id=gm_child AND scope='gm' AND folder_id IS NULL;
 IF n<>1 THEN RAISE EXCEPTION 'Nested note did not inherit GM section';END IF;
 SELECT hollowgate_vtt.save_owned_campaign_note(owner,campaign,shared_root,'Shared note',NULL,0,'all') INTO answer;
 SELECT hollowgate_vtt.save_owned_campaign_note(owner,campaign,gm_root,'GM note',NULL,0,'all') INTO answer;
 SELECT hollowgate_vtt.save_owned_campaign_note(owner,campaign,gm_child,'GM child',NULL,0,'all') INTO answer;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_member_campaign_notes(player,campaign,NULL);
 IF n<>1 THEN RAISE EXCEPTION 'GM root leaked to player';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_member_campaign_notes(player,campaign,gm_root);
 IF n<>0 THEN RAISE EXCEPTION 'GM child leaked to player';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_member_campaign_notes(gm,campaign,NULL);
 IF n<>2 THEN RAISE EXCEPTION 'GM cannot see shared and GM root';END IF;
 SELECT hollowgate_vtt.assign_owned_campaign_note_folder(owner,campaign,shared_root,shared_folder) INTO answer;
 IF answer IS DISTINCT FROM shared_root THEN RAISE EXCEPTION 'Shared note folder assignment failed';END IF;
 SELECT hollowgate_vtt.assign_owned_campaign_note_folder(owner,campaign,gm_root,gm_folder) INTO answer;
 IF answer IS DISTINCT FROM gm_root THEN RAISE EXCEPTION 'GM note folder assignment failed';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_member_campaign_notes_with_folders(player,campaign,NULL)
 WHERE id=shared_root AND folder_id=shared_folder AND scope='shared';
 IF n<>1 THEN RAISE EXCEPTION 'Player cannot read shared folder assignment';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_member_campaign_notes_with_folders(player,campaign,NULL)
 WHERE id=gm_root;
 IF n<>0 THEN RAISE EXCEPTION 'Folder-aware reader leaked GM note';END IF;
 SELECT hollowgate_vtt.assign_owned_campaign_note_folder(owner,campaign,shared_root,gm_folder) INTO answer;
 IF answer IS NOT NULL THEN RAISE EXCEPTION 'Cross-section folder assigned';END IF;
 SELECT hollowgate_vtt.assign_owned_campaign_note_folder(owner,campaign,shared_root,external_folder) INTO answer;
 IF answer IS NOT NULL THEN RAISE EXCEPTION 'Cross-campaign folder assigned';END IF;
 SELECT hollowgate_vtt.assign_owned_campaign_note_folder(player,campaign,shared_root,shared_folder) INTO answer;
 IF answer IS NOT NULL THEN RAISE EXCEPTION 'Player moved note';END IF;
 SELECT hollowgate_vtt.assign_owned_campaign_note_folder(owner,campaign,gm_child,gm_folder) INTO answer;
 IF answer IS NOT NULL THEN RAISE EXCEPTION 'Child assigned to a folder';END IF;
 SELECT hollowgate_vtt.assign_owned_campaign_note_folder(owner,campaign,shared_root,NULL) INTO answer;
 IF answer IS DISTINCT FROM shared_root THEN RAISE EXCEPTION 'Removing from folder failed';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.campaign_notes
 WHERE id=shared_root AND folder_id IS NULL;
 IF n<>1 THEN RAISE EXCEPTION 'Note still in folder after detach';END IF;
END $$;
ROLLBACK;
