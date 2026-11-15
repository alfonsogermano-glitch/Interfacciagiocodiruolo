BEGIN;
DO $$
DECLARE owner uuid:=gen_random_uuid();player uuid:=gen_random_uuid();
 other uuid:=gen_random_uuid();campaign uuid;foreign_campaign uuid;
 parent uuid;child_folder uuid;no_delete uuid;foreign_folder uuid;
 root_note uuid;child_note uuid;safe_note uuid;note_in_child uuid;
 result uuid;ct integer;
BEGIN
 INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source)
 VALUES(owner,'archive-folder-owner@example.org','Owner','active',now(),'local'),
 (player,'archive-folder-player@example.org','Player','active',now(),'local'),
 (other,'archive-folder-other@example.org','Other','active',now(),'local');
 SELECT hollowgate_vtt.create_owned_campaign(owner,'Archive Notes','','hsc') INTO campaign;
 SELECT hollowgate_vtt.create_owned_campaign(other,'External','','hsc') INTO foreign_campaign;
 SELECT hollowgate_vtt.set_campaign_membership(owner,campaign,player,'player',true) INTO result;
 SELECT hollowgate_vtt.create_owned_note_folder(owner,campaign,'shared','Root',NULL) INTO parent;
 SELECT hollowgate_vtt.create_owned_note_folder(owner,campaign,'shared','Sub',parent) INTO child_folder;
 SELECT hollowgate_vtt.create_owned_note_folder(owner,campaign,'shared','Preserve',NULL) INTO no_delete;
 SELECT hollowgate_vtt.create_owned_note_folder(other,foreign_campaign,'shared','Foreign',NULL) INTO foreign_folder;
 SELECT hollowgate_vtt.create_owned_campaign_note_scoped(owner,campaign,'Inside root','shared') INTO root_note;
 SELECT hollowgate_vtt.create_owned_campaign_note(owner,campaign,'Child TipTap',root_note) INTO child_note;
 SELECT hollowgate_vtt.create_owned_campaign_note_scoped(owner,campaign,'Inside sub','shared') INTO note_in_child;
 SELECT hollowgate_vtt.create_owned_campaign_note_scoped(owner,campaign,'Preserved','shared') INTO safe_note;
 SELECT hollowgate_vtt.assign_owned_campaign_note_folder(owner,campaign,root_note,parent) INTO result;
 SELECT hollowgate_vtt.assign_owned_campaign_note_folder(owner,campaign,note_in_child,child_folder) INTO result;
 SELECT hollowgate_vtt.save_owned_campaign_note(owner,campaign,safe_note,'Preserved',NULL,0,'all') INTO result;
 SELECT hollowgate_vtt.assign_owned_campaign_note_folder(owner,campaign,safe_note,no_delete) INTO result;
 SELECT hollowgate_vtt.save_owned_campaign_note(owner,campaign,child_note,'Child TipTap',
 '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"safe"}]}]}'::jsonb,0,'all') INTO result;
 SELECT hollowgate_vtt.set_owned_note_folder_presentation(player,campaign,parent,'folder',7) INTO result;
 IF result IS NOT NULL THEN RAISE EXCEPTION 'Player changed folder presentation';END IF;
 SELECT hollowgate_vtt.set_owned_note_folder_presentation(owner,campaign,foreign_folder,'folder',7) INTO result;
 IF result IS NOT NULL THEN RAISE EXCEPTION 'Cross-campaign presentation';END IF;
 SELECT hollowgate_vtt.set_owned_note_folder_presentation(owner,campaign,parent,'book-open',9) INTO result;
 IF result IS DISTINCT FROM parent THEN RAISE EXCEPTION 'Owner presentation failed';END IF;
 SELECT count(*) INTO ct FROM hollowgate_vtt.list_member_note_folders(player,campaign,'shared')
 WHERE id=parent AND icon='book-open' AND folder_position=9;
 IF ct<>1 THEN RAISE EXCEPTION 'Icon/order not readable';END IF;
 SELECT hollowgate_vtt.archive_owned_note_folder(player,campaign,parent,true) INTO result;
 IF result IS NOT NULL THEN RAISE EXCEPTION 'Player archived folder';END IF;
 SELECT hollowgate_vtt.archive_owned_note_folder(owner,campaign,foreign_folder,true) INTO result;
 IF result IS NOT NULL THEN RAISE EXCEPTION 'Foreign folder archived';END IF;
 SELECT hollowgate_vtt.archive_owned_note_folder(owner,campaign,no_delete,false) INTO result;
 IF result IS DISTINCT FROM no_delete THEN RAISE EXCEPTION 'Noncascade archive failed';END IF;
 SELECT count(*) INTO ct FROM hollowgate_vtt.campaign_notes
 WHERE id=safe_note AND status='active' AND folder_id IS NULL;
 IF ct<>1 THEN RAISE EXCEPTION 'Noncascade dropped note or folder reference';END IF;
 SELECT hollowgate_vtt.archive_owned_note_folder(owner,campaign,parent,true) INTO result;
 IF result IS DISTINCT FROM parent THEN RAISE EXCEPTION 'Cascade archive failed';END IF;
 SELECT count(*) INTO ct FROM hollowgate_vtt.campaign_note_folders
 WHERE id IN(parent,child_folder) AND status='archived';
 IF ct<>2 THEN RAISE EXCEPTION 'Folder subtree not archived';END IF;
 SELECT count(*) INTO ct FROM hollowgate_vtt.campaign_notes
 WHERE id IN(root_note,child_note,note_in_child) AND status='archived';
 IF ct<>3 THEN RAISE EXCEPTION 'Folder archive left active document';END IF;
 SELECT count(*) INTO ct FROM hollowgate_vtt.campaign_notes
 WHERE id=child_note AND content_rich->>'type'='doc'
 AND content_rich::text LIKE '%safe%';
 IF ct<>1 THEN RAISE EXCEPTION 'Cascade deleted TipTap document';END IF;
 SELECT count(*) INTO ct FROM hollowgate_vtt.list_member_note_folders(player,campaign,'shared');
 IF ct<>0 THEN RAISE EXCEPTION 'Archived folders still visible';END IF;
 SELECT count(*) INTO ct FROM hollowgate_vtt.list_member_campaign_notes(player,campaign,NULL);
 IF ct<>1 THEN RAISE EXCEPTION 'Archived notes still visible or safe note missing';END IF;
 SELECT hollowgate_vtt.archive_owned_note_folder(owner,campaign,parent,true) INTO result;
 IF result IS NOT NULL THEN RAISE EXCEPTION 'Archive accepted inactive folder';END IF;
 IF has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.campaign_note_folders','DELETE')
 OR has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.campaign_notes','DELETE')
 THEN RAISE EXCEPTION 'Runtime gained destructive privileges';END IF;
END $$;
ROLLBACK;
