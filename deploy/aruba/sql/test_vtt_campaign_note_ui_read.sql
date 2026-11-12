BEGIN;
DO $$
DECLARE owner uuid:=gen_random_uuid();gm uuid:=gen_random_uuid();
 player uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();
 campaign uuid;other_campaign uuid;shared_private uuid;gm_private uuid;
 child uuid;shared_public uuid;ok uuid;ct integer;
BEGIN
 INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source)
 VALUES(owner,'ui-note-owner@example.org','Owner','active',now(),'local'),
 (gm,'ui-note-gm@example.org','GM','active',now(),'local'),
 (player,'ui-note-player@example.org','Player','active',now(),'local'),
 (outsider,'ui-note-other@example.org','Other','active',now(),'local');
 SELECT hollowgate_vtt.create_owned_campaign(owner,'UI Notes','','hsc') INTO campaign;
 SELECT hollowgate_vtt.create_owned_campaign(outsider,'Other','','hsc') INTO other_campaign;
 SELECT hollowgate_vtt.set_campaign_membership(owner,campaign,gm,'gm',true) INTO ok;
 SELECT hollowgate_vtt.set_campaign_membership(owner,campaign,player,'player',true) INTO ok;
 SELECT hollowgate_vtt.create_owned_campaign_note_scoped(owner,campaign,'Shared private','shared') INTO shared_private;
 SELECT hollowgate_vtt.create_owned_campaign_note_scoped(owner,campaign,'GM private','gm') INTO gm_private;
 SELECT hollowgate_vtt.create_owned_campaign_note_scoped(owner,campaign,'Shared public','shared') INTO shared_public;
 SELECT hollowgate_vtt.create_owned_campaign_note(owner,campaign,'Private subtab',shared_private) INTO child;
 SELECT hollowgate_vtt.save_owned_campaign_note(owner,campaign,shared_public,'Shared public',NULL,0,'all') INTO ok;
 SELECT count(*) INTO ct FROM hollowgate_vtt.list_member_campaign_notes_ui(player,campaign,NULL);
 IF ct<>1 THEN RAISE EXCEPTION 'Player leaked private or GM Note';END IF;
 SELECT count(*) INTO ct FROM hollowgate_vtt.list_member_campaign_notes_ui(player,campaign,shared_private);
 IF ct<>0 THEN RAISE EXCEPTION 'Player leaked child of private root';END IF;
 SELECT count(*) INTO ct FROM hollowgate_vtt.list_member_campaign_notes_ui(gm,campaign,NULL);
 IF ct<>3 THEN RAISE EXCEPTION 'GM cannot see own campaign private Notes';END IF;
 SELECT count(*) INTO ct FROM hollowgate_vtt.list_member_campaign_notes_ui(gm,campaign,shared_private);
 IF ct<>1 THEN RAISE EXCEPTION 'GM cannot see private subtab';END IF;
 SELECT count(*) INTO ct FROM hollowgate_vtt.list_member_campaign_notes_ui(outsider,campaign,NULL);
 IF ct<>0 THEN RAISE EXCEPTION 'Outsider enumerated notes';END IF;
 SELECT count(*) INTO ct FROM hollowgate_vtt.list_member_campaign_notes_ui(gm,other_campaign,NULL);
 IF ct<>0 THEN RAISE EXCEPTION 'GM role leaked between campaigns';END IF;
 SELECT count(*) INTO ct FROM hollowgate_vtt.list_member_campaign_notes_ui(gm,campaign,NULL)
 WHERE id=shared_private AND creator_id=owner AND scope='shared'
  AND folder_id IS NULL AND updated_at IS NOT NULL;
 IF ct<>1 THEN RAISE EXCEPTION 'Missing UI creator/scope metadata';END IF;
 SELECT hollowgate_vtt.set_campaign_membership(owner,campaign,gm,'gm',false) INTO ok;
 SELECT count(*) INTO ct FROM hollowgate_vtt.list_member_campaign_notes_ui(gm,campaign,NULL);
 IF ct<>0 THEN RAISE EXCEPTION 'Revoked GM still reads private Note';END IF;
 IF has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.campaign_notes','SELECT')
 THEN RAISE EXCEPTION 'Direct Note reads exposed to runtime';END IF;
END $$;
ROLLBACK;
