BEGIN;
DO $$
DECLARE a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();
 gm uuid:=gen_random_uuid();other uuid:=gen_random_uuid();
 campaign uuid;external_campaign uuid;
 root uuid;sub1 uuid;sub2 uuid;sub3 uuid;sub4 uuid;
 shared_root uuid;foreign_root uuid;answer uuid;cnt integer;
BEGIN
 INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source)
 VALUES(a,'folder-owner@example.org','Owner','active',now(),'local'),
 (b,'folder-player@example.org','Player','active',now(),'local'),
 (gm,'folder-gm@example.org','GM','active',now(),'local'),
 (other,'folder-other@example.org','Other','active',now(),'local');
 SELECT hollowgate_vtt.create_owned_campaign(a,'Folders','','hsc') INTO campaign;
 SELECT hollowgate_vtt.create_owned_campaign(other,'Foreign folders','','hsc') INTO external_campaign;
 SELECT hollowgate_vtt.set_campaign_membership(a,campaign,b,'player',true) INTO answer;
 SELECT hollowgate_vtt.set_campaign_membership(a,campaign,gm,'gm',true) INTO answer;
 SELECT hollowgate_vtt.create_owned_note_folder(a,campaign,'gm','Segreti',NULL) INTO root;
 SELECT hollowgate_vtt.create_owned_note_folder(a,campaign,'gm','L2',root) INTO sub1;
 SELECT hollowgate_vtt.create_owned_note_folder(a,campaign,'gm','L3',sub1) INTO sub2;
 SELECT hollowgate_vtt.create_owned_note_folder(a,campaign,'gm','L4',sub2) INTO sub3;
 SELECT hollowgate_vtt.create_owned_note_folder(a,campaign,'gm','L5',sub3) INTO sub4;
 IF root IS NULL OR sub4 IS NULL THEN RAISE EXCEPTION 'Five-level nesting failed';END IF;
 SELECT hollowgate_vtt.create_owned_note_folder(a,campaign,'gm','Too deep',sub4) INTO answer;
 IF answer IS NOT NULL THEN RAISE EXCEPTION 'Sixth folder level allowed';END IF;
 SELECT hollowgate_vtt.create_owned_note_folder(a,campaign,'shared','Wrong scope',root) INTO answer;
 IF answer IS NOT NULL THEN RAISE EXCEPTION 'Cross-scope nesting allowed';END IF;
 SELECT hollowgate_vtt.create_owned_note_folder(a,campaign,'shared','Pubblica',NULL) INTO shared_root;
 SELECT hollowgate_vtt.create_owned_note_folder(other,external_campaign,'shared','Foreign',NULL) INTO foreign_root;
 SELECT hollowgate_vtt.create_owned_note_folder(b,campaign,'shared','Forged',NULL) INTO answer;
 IF answer IS NOT NULL THEN RAISE EXCEPTION 'Player created a folder';END IF;
 SELECT count(*) INTO cnt FROM hollowgate_vtt.list_member_note_folders(b,campaign,'gm');
 IF cnt<>0 THEN RAISE EXCEPTION 'GM folders leaked to player';END IF;
 SELECT count(*) INTO cnt FROM hollowgate_vtt.list_member_note_folders(gm,campaign,'gm');
 IF cnt<>5 THEN RAISE EXCEPTION 'GM cannot read GM folders';END IF;
 SELECT count(*) INTO cnt FROM hollowgate_vtt.list_member_note_folders(b,campaign,'shared');
 IF cnt<>1 THEN RAISE EXCEPTION 'Player cannot read shared folders';END IF;
 SELECT count(*) INTO cnt FROM hollowgate_vtt.list_member_note_folders(other,campaign,'shared');
 IF cnt<>0 THEN RAISE EXCEPTION 'Outsider read folders';END IF;
 SELECT hollowgate_vtt.update_owned_note_folder(b,campaign,shared_root,'Forged',NULL) INTO answer;
 IF answer IS NOT NULL THEN RAISE EXCEPTION 'Player renamed a folder';END IF;
 SELECT hollowgate_vtt.update_owned_note_folder(a,campaign,root,'Cycle',sub4) INTO answer;
 IF answer IS NOT NULL THEN RAISE EXCEPTION 'Folder cycle allowed';END IF;
 SELECT hollowgate_vtt.update_owned_note_folder(a,campaign,root,'Wrong scope',shared_root) INTO answer;
 IF answer IS NOT NULL THEN RAISE EXCEPTION 'GM folder moved into shared folder';END IF;
 SELECT hollowgate_vtt.update_owned_note_folder(a,campaign,root,'Foreign',foreign_root) INTO answer;
 IF answer IS NOT NULL THEN RAISE EXCEPTION 'Cross-campaign nesting allowed';END IF;
 SELECT hollowgate_vtt.update_owned_note_folder(a,campaign,root,'Rinominata',NULL) INTO answer;
 IF answer IS DISTINCT FROM root THEN RAISE EXCEPTION 'Owner rename failed';END IF;
 SELECT count(*) INTO cnt FROM hollowgate_vtt.list_member_note_folders(gm,campaign,'gm')
 WHERE id=root AND name='Rinominata';
 IF cnt<>1 THEN RAISE EXCEPTION 'Updated folder not visible';END IF;
 SELECT hollowgate_vtt.set_campaign_membership(a,campaign,b,'player',false) INTO answer;
 SELECT count(*) INTO cnt FROM hollowgate_vtt.list_member_note_folders(b,campaign,'shared');
 IF cnt<>0 THEN RAISE EXCEPTION 'Revoked player still sees folders';END IF;
 IF has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.campaign_note_folders','SELECT')
  OR has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.campaign_note_folders','UPDATE')
 THEN RAISE EXCEPTION 'Runtime has direct folder table privileges';END IF;
END $$;
ROLLBACK;
