BEGIN;
DO $$
DECLARE owner uuid:=gen_random_uuid();gm uuid:=gen_random_uuid();
 outsider uuid:=gen_random_uuid();c uuid;external_c uuid;root uuid;child uuid;
 folder uuid;subfolder uuid;archived_nested uuid;v uuid;ct integer;
BEGIN
 INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source)
 VALUES(owner,'trash25-owner@example.org','Owner','active',now(),'local'),
 (gm,'trash25-gm@example.org','GM','active',now(),'local'),
 (outsider,'trash25-outside@example.org','Outside','active',now(),'local');
 SELECT hollowgate_vtt.create_owned_campaign(owner,'Restore test','','hsc') INTO c;
 SELECT hollowgate_vtt.create_owned_campaign(outsider,'Other','','hsc') INTO external_c;
 SELECT hollowgate_vtt.set_campaign_membership(owner,c,gm,'gm',true) INTO v;
 SELECT hollowgate_vtt.create_owned_note_folder(owner,c,'shared','Parent',NULL) INTO folder;
 SELECT hollowgate_vtt.create_owned_note_folder(owner,c,'shared','Nested',folder) INTO subfolder;
 SELECT hollowgate_vtt.create_member_campaign_note(owner,c,'Archived root',NULL,'shared') INTO root;
 SELECT hollowgate_vtt.create_member_campaign_note(owner,c,'Child',root,NULL) INTO child;
 SELECT hollowgate_vtt.save_member_campaign_note(owner,c,child,'Child',
 '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,0,'all') INTO v;
 SELECT hollowgate_vtt.save_member_campaign_note(owner,c,root,'Archived root',NULL,0,'all') INTO v;
 SELECT hollowgate_vtt.assign_member_campaign_note_folder(owner,c,root,folder) INTO v;
 SELECT hollowgate_vtt.archive_owned_note_folder(owner,c,folder,true) INTO v;
 SELECT count(*) INTO ct FROM hollowgate_vtt.list_owned_campaign_trash(owner,c);
 IF ct<>4 THEN RAISE EXCEPTION 'Trash should contain root, child, folder and nested';END IF;
 SELECT count(*) INTO ct FROM hollowgate_vtt.list_owned_campaign_trash(gm,c);
 IF ct<>0 THEN RAISE EXCEPTION 'Nonowner GM enumerated trash';END IF;
 SELECT count(*) INTO ct FROM hollowgate_vtt.list_owned_campaign_trash(outsider,c);
 IF ct<>0 THEN RAISE EXCEPTION 'Outside user enumerated trash';END IF;
 SELECT hollowgate_vtt.restore_owned_campaign_note(gm,c,root) INTO v;
 IF v IS NOT NULL THEN RAISE EXCEPTION 'Nonowner restored Note';END IF;
 SELECT hollowgate_vtt.restore_owned_note_folder(gm,c,folder) INTO v;
 IF v IS NOT NULL THEN RAISE EXCEPTION 'Nonowner restored folder';END IF;
 SELECT hollowgate_vtt.restore_owned_campaign_note(owner,external_c,root) INTO v;
 IF v IS NOT NULL THEN RAISE EXCEPTION 'Cross-campaign note restore';END IF;
 SELECT hollowgate_vtt.restore_owned_campaign_note(owner,c,child) INTO v;
 IF v IS NOT NULL THEN RAISE EXCEPTION 'Child restored without parent';END IF;
 SELECT hollowgate_vtt.restore_owned_note_folder(owner,c,subfolder) INTO v;
 IF v IS DISTINCT FROM subfolder THEN RAISE EXCEPTION 'Nested folder restore failed';END IF;
 SELECT count(*) INTO ct FROM hollowgate_vtt.campaign_note_folders
 WHERE id=subfolder AND status='active' AND parent_folder_id IS NULL;
 IF ct<>1 THEN RAISE EXCEPTION 'Child folder not safely detached from archived parent';END IF;
 SELECT hollowgate_vtt.restore_owned_campaign_note(owner,c,root) INTO v;
 IF v IS DISTINCT FROM root THEN RAISE EXCEPTION 'Root restore failed';END IF;
 SELECT count(*) INTO ct FROM hollowgate_vtt.campaign_notes
 WHERE id IN(root,child) AND status='active' AND visibility='private';
 IF ct<>2 THEN RAISE EXCEPTION 'Root/child failed conservative private restore';END IF;
 SELECT count(*) INTO ct FROM hollowgate_vtt.campaign_notes
 WHERE id=root AND folder_id IS NULL;
 IF ct<>1 THEN RAISE EXCEPTION 'Restored note retained archived folder';END IF;
 SELECT count(*) INTO ct FROM hollowgate_vtt.campaign_notes
 WHERE id=child AND content_rich->>'type'='doc';
 IF ct<>1 THEN RAISE EXCEPTION 'Restored TipTap child content lost';END IF;
 SELECT count(*) INTO ct FROM hollowgate_vtt.list_member_campaign_notes_ui(gm,c,NULL)
 WHERE id=root;
 IF ct<>1 THEN RAISE EXCEPTION 'GM cannot read safely restored Note';END IF;
 SELECT hollowgate_vtt.restore_owned_note_folder(owner,c,folder) INTO v;
 IF v IS DISTINCT FROM folder THEN RAISE EXCEPTION 'Root folder restore failed';END IF;
 SELECT count(*) INTO ct FROM hollowgate_vtt.list_owned_campaign_trash(owner,c);
 IF ct<>0 THEN RAISE EXCEPTION 'Restored elements remain in trash';END IF;
 SELECT hollowgate_vtt.restore_owned_campaign_note(owner,c,root) INTO v;
 IF v IS NOT NULL THEN RAISE EXCEPTION 'Already-restored Note restored twice';END IF;
 IF has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.campaign_notes','DELETE')
  OR has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.campaign_note_folders','DELETE')
 THEN RAISE EXCEPTION 'Runtime got destructive table permissions';END IF;
END $$;
ROLLBACK;
