BEGIN;
DO $$
DECLARE owner uuid:=gen_random_uuid();gm uuid:=gen_random_uuid();
 player uuid:=gen_random_uuid();rival uuid:=gen_random_uuid();
 outsider uuid:=gen_random_uuid();campaign uuid;foreign_campaign uuid;
 a uuid;b uuid;child uuid;gm_root uuid;gm_child uuid;dir uuid;gm_dir uuid;
 v uuid;ct integer;
BEGIN
 INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source)
 VALUES(owner,'write-owner@example.org','Owner','active',now(),'local'),
 (gm,'write-gm@example.org','GM','active',now(),'local'),
 (player,'write-player@example.org','Player','active',now(),'local'),
 (rival,'write-rival@example.org','Rival','active',now(),'local'),
 (outsider,'write-outsider@example.org','Outsider','active',now(),'local');
 SELECT hollowgate_vtt.create_owned_campaign(owner,'Writer test','','hsc') INTO campaign;
 SELECT hollowgate_vtt.create_owned_campaign(outsider,'Other test','','hsc') INTO foreign_campaign;
 SELECT hollowgate_vtt.set_campaign_membership(owner,campaign,gm,'gm',true) INTO v;
 SELECT hollowgate_vtt.set_campaign_membership(owner,campaign,player,'player',true) INTO v;
 SELECT hollowgate_vtt.set_campaign_membership(owner,campaign,rival,'player',true) INTO v;
 SELECT hollowgate_vtt.create_member_campaign_note(player,campaign,'Player A',NULL,'shared') INTO a;
 SELECT hollowgate_vtt.create_member_campaign_note(rival,campaign,'Rival B',NULL,'shared') INTO b;
 SELECT hollowgate_vtt.create_member_campaign_note(gm,campaign,'GM secret',NULL,'gm') INTO gm_root;
 IF a IS NULL OR b IS NULL OR gm_root IS NULL THEN
  RAISE EXCEPTION 'Member note create failed';END IF;
 SELECT count(*) INTO ct FROM hollowgate_vtt.campaign_notes
 WHERE id=a AND creator_id=player AND visibility='all' AND scope='shared';
 IF ct<>1 THEN RAISE EXCEPTION 'Member author/visibility lost';END IF;
 SELECT hollowgate_vtt.create_member_campaign_note(player,campaign,'Forged GM',NULL,'gm') INTO v;
 IF v IS NOT NULL THEN RAISE EXCEPTION 'Player created GM note';END IF;
 SELECT hollowgate_vtt.create_member_campaign_note(player,foreign_campaign,'Intrusion',NULL,'shared') INTO v;
 IF v IS NOT NULL THEN RAISE EXCEPTION 'Cross-campaign create';END IF;
 SELECT hollowgate_vtt.create_member_campaign_note(player,campaign,'My leaf',a,NULL) INTO child;
 SELECT hollowgate_vtt.create_member_campaign_note(gm,campaign,'GM leaf',gm_root,NULL) INTO gm_child;
 IF child IS NULL OR gm_child IS NULL THEN RAISE EXCEPTION 'Child create failed';END IF;
 SELECT hollowgate_vtt.create_member_campaign_note(rival,campaign,'Foreign leaf',a,NULL) INTO v;
 IF v IS NOT NULL THEN RAISE EXCEPTION 'Rival created leaf on other note';END IF;
 BEGIN
  SELECT hollowgate_vtt.create_member_campaign_note(player,campaign,'Wrong scope',a,'gm') INTO v;
  RAISE EXCEPTION 'Client forged child scope';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
 END;
 SELECT count(*) INTO ct FROM hollowgate_vtt.campaign_notes
 WHERE id=gm_child AND scope='gm' AND creator_id=gm;
 IF ct<>1 THEN RAISE EXCEPTION 'GM child did not inherit GM scope';END IF;
 SELECT hollowgate_vtt.save_member_campaign_note(player,campaign,a,'Edited',
 '{"type":"doc","content":[]}'::jsonb,3,'private') INTO v;
 IF v IS DISTINCT FROM a THEN RAISE EXCEPTION 'Player cannot edit own note';END IF;
 SELECT hollowgate_vtt.save_member_campaign_note(rival,campaign,a,'Stolen',NULL,1,'all') INTO v;
 IF v IS NOT NULL THEN RAISE EXCEPTION 'Player edited foreign note';END IF;
 SELECT hollowgate_vtt.save_member_campaign_note(player,campaign,gm_root,'Stolen GM',NULL,1,'all') INTO v;
 IF v IS NOT NULL THEN RAISE EXCEPTION 'Player edited GM note';END IF;
 SELECT hollowgate_vtt.save_member_campaign_note(gm,campaign,a,'GM amended',NULL,3,'all') INTO v;
 IF v IS DISTINCT FROM a THEN RAISE EXCEPTION 'GM cannot edit campaign note';END IF;
 SELECT hollowgate_vtt.save_member_campaign_note(player,campaign,child,'Edited child',
 '{"type":"doc"}'::jsonb,0,'private') INTO v;
 IF v IS DISTINCT FROM child THEN RAISE EXCEPTION 'Player cannot edit own child';END IF;
 SELECT hollowgate_vtt.save_member_campaign_note(rival,campaign,child,'Stolen child',NULL,0,'all') INTO v;
 IF v IS NOT NULL THEN RAISE EXCEPTION 'Rival edited foreign child';END IF;
 -- A GM may add a tab to a player's parent. The player retains parent-derived
 -- editor rights even though the child creator remains the GM.
 SELECT hollowgate_vtt.create_member_campaign_note(gm,campaign,'GM added leaf',a,NULL) INTO v;
 IF v IS NULL THEN RAISE EXCEPTION 'GM cannot create tab under player note';END IF;
 SELECT hollowgate_vtt.save_member_campaign_note(player,campaign,v,'Edited by owner',
  '{"type":"doc"}'::jsonb,2,'all') INTO v;
 IF v IS NULL THEN RAISE EXCEPTION 'Parent author cannot edit GM-added child';END IF;
 SELECT hollowgate_vtt.create_owned_note_folder(owner,campaign,'shared','Shared dir',NULL) INTO dir;
 SELECT hollowgate_vtt.create_owned_note_folder(owner,campaign,'gm','GM dir',NULL) INTO gm_dir;
 SELECT hollowgate_vtt.assign_member_campaign_note_folder(player,campaign,a,dir) INTO v;
 IF v IS DISTINCT FROM a THEN RAISE EXCEPTION 'Author cannot move own note';END IF;
 SELECT hollowgate_vtt.assign_member_campaign_note_folder(player,campaign,a,gm_dir) INTO v;
 IF v IS NOT NULL THEN RAISE EXCEPTION 'Cross-scope move accepted';END IF;
 SELECT hollowgate_vtt.assign_member_campaign_note_folder(rival,campaign,a,dir) INTO v;
 IF v IS NOT NULL THEN RAISE EXCEPTION 'Rival moved foreign note';END IF;
 SELECT hollowgate_vtt.assign_member_campaign_note_folder(player,campaign,child,dir) INTO v;
 IF v IS NOT NULL THEN RAISE EXCEPTION 'Child moved into folder';END IF;
 SELECT hollowgate_vtt.assign_member_campaign_note_folder(gm,campaign,gm_root,gm_dir) INTO v;
 IF v IS DISTINCT FROM gm_root THEN RAISE EXCEPTION 'GM cannot organize secret';END IF;
 SELECT hollowgate_vtt.archive_member_campaign_note(rival,campaign,a) INTO v;
 IF v IS NOT NULL THEN RAISE EXCEPTION 'Rival archived foreign note';END IF;
 SELECT hollowgate_vtt.archive_member_campaign_note(player,campaign,gm_root) INTO v;
 IF v IS NOT NULL THEN RAISE EXCEPTION 'Player archived GM note';END IF;
 SELECT hollowgate_vtt.archive_member_campaign_note(player,campaign,a) INTO v;
 IF v IS DISTINCT FROM a THEN RAISE EXCEPTION 'Player cannot archive own root';END IF;
 SELECT count(*) INTO ct FROM hollowgate_vtt.campaign_notes
 WHERE id IN(a,child) AND status='archived';
 IF ct<>2 THEN RAISE EXCEPTION 'Archive did not preserve child cascade';END IF;
 SELECT hollowgate_vtt.set_campaign_membership(owner,campaign,gm,'gm',false) INTO v;
 SELECT hollowgate_vtt.save_member_campaign_note(gm,campaign,b,'Revoked edit',NULL,0,'all') INTO v;
 IF v IS NOT NULL THEN RAISE EXCEPTION 'Revoked GM still edits notes';END IF;
 SELECT hollowgate_vtt.create_member_campaign_note(gm,campaign,'Revoked create',NULL,'gm') INTO v;
 IF v IS NOT NULL THEN RAISE EXCEPTION 'Revoked GM still creates notes';END IF;
 IF has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.campaign_notes','UPDATE')
 OR has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.campaign_notes','INSERT')
 THEN RAISE EXCEPTION 'Direct table write leaked';END IF;
END $$;
ROLLBACK;
