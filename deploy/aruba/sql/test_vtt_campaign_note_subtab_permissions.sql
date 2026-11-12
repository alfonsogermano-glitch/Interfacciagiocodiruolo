BEGIN;
DO $$
DECLARE owner uuid:=gen_random_uuid();gm uuid:=gen_random_uuid();
 player uuid:=gen_random_uuid();rival uuid:=gen_random_uuid();
 outsider uuid:=gen_random_uuid();campaign uuid;foreign_campaign uuid;
 parent_private uuid;parent_public uuid;gm_child uuid;gm_private_child uuid;
 foreign_private_child uuid; gm_root uuid;gm_only_child uuid;v uuid;ct integer;
BEGIN
 INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source)
 VALUES(owner,'subtab-owner-22@example.org','Owner','active',now(),'local'),
 (gm,'subtab-gm-22@example.org','GM','active',now(),'local'),
 (player,'subtab-player-22@example.org','Player','active',now(),'local'),
 (rival,'subtab-rival-22@example.org','Rival','active',now(),'local'),
 (outsider,'subtab-outsider-22@example.org','Outside','active',now(),'local');
 SELECT hollowgate_vtt.create_owned_campaign(owner,'Subtab rights','','hsc') INTO campaign;
 SELECT hollowgate_vtt.create_owned_campaign(outsider,'Foreign','','hsc') INTO foreign_campaign;
 SELECT hollowgate_vtt.set_campaign_membership(owner,campaign,gm,'gm',true) INTO v;
 SELECT hollowgate_vtt.set_campaign_membership(owner,campaign,player,'player',true) INTO v;
 SELECT hollowgate_vtt.set_campaign_membership(owner,campaign,rival,'player',true) INTO v;
 SELECT hollowgate_vtt.create_member_campaign_note(player,campaign,'Own private',NULL,'shared') INTO parent_private;
 SELECT hollowgate_vtt.create_member_campaign_note(player,campaign,'Own public',NULL,'shared') INTO parent_public;
 SELECT hollowgate_vtt.create_member_campaign_note(gm,campaign,'GM child',parent_private,NULL) INTO gm_private_child;
 SELECT hollowgate_vtt.create_member_campaign_note(gm,campaign,'GM second child',parent_public,NULL) INTO gm_child;
 SELECT hollowgate_vtt.create_member_campaign_note(gm,campaign,'GM section',NULL,'gm') INTO gm_root;
 SELECT hollowgate_vtt.create_member_campaign_note(gm,campaign,'GM only child',gm_root,NULL) INTO gm_only_child;
 SELECT hollowgate_vtt.save_member_campaign_note(player,campaign,parent_private,
  'Own private',NULL,0,'private') INTO v;
 SELECT hollowgate_vtt.save_member_campaign_note(player,campaign,parent_public,
  'Own public',NULL,0,'all') INTO v;
 SELECT hollowgate_vtt.save_member_campaign_note(gm,campaign,gm_private_child,
  'GM child',NULL,0,'private') INTO v;
 SELECT hollowgate_vtt.save_member_campaign_note(gm,campaign,gm_child,
  'GM second child',NULL,0,'private') INTO v;
 SELECT hollowgate_vtt.save_member_campaign_note(gm,campaign,gm_only_child,
  'GM only child',NULL,0,'all') INTO v;
 SELECT count(*) INTO ct FROM hollowgate_vtt.list_member_campaign_notes_ui(player,campaign,parent_private)
 WHERE id=gm_private_child AND creator_id=gm AND editor_owner_id=player;
 IF ct<>1 THEN RAISE EXCEPTION 'Parent author cannot read GM-authored private subtab';END IF;
 SELECT count(*) INTO ct FROM hollowgate_vtt.list_member_campaign_notes_ui(player,campaign,parent_public)
 WHERE id=gm_child AND creator_id=gm AND editor_owner_id=player;
 IF ct<>1 THEN RAISE EXCEPTION 'Parent author lacks editor rights for private subtab';END IF;
 SELECT count(*) INTO ct FROM hollowgate_vtt.list_member_campaign_notes_ui(rival,campaign,parent_public)
 WHERE id=gm_child;
 IF ct<>0 THEN RAISE EXCEPTION 'Rival read private child under public root';END IF;
 SELECT count(*) INTO ct FROM hollowgate_vtt.list_member_campaign_notes_ui(rival,campaign,parent_private);
 IF ct<>0 THEN RAISE EXCEPTION 'Rival read a private parent through its children';END IF;
 SELECT count(*) INTO ct FROM hollowgate_vtt.list_member_campaign_notes_ui(player,campaign,gm_root);
 IF ct<>0 THEN RAISE EXCEPTION 'Player enumerated GM-only child';END IF;
 SELECT count(*) INTO ct FROM hollowgate_vtt.list_member_campaign_notes_ui(gm,campaign,parent_private)
 WHERE id=gm_private_child;
 IF ct<>1 THEN RAISE EXCEPTION 'GM cannot inspect private subtab';END IF;
 SELECT count(*) INTO ct FROM hollowgate_vtt.list_member_campaign_notes_ui(outsider,campaign,parent_public);
 IF ct<>0 THEN RAISE EXCEPTION 'Outsider read subtab';END IF;
 SELECT count(*) INTO ct FROM hollowgate_vtt.list_member_campaign_notes_ui(player,foreign_campaign,parent_public);
 IF ct<>0 THEN RAISE EXCEPTION 'Cross-campaign child leak';END IF;
 SELECT hollowgate_vtt.set_campaign_membership(owner,campaign,player,'player',false) INTO v;
 SELECT count(*) INTO ct FROM hollowgate_vtt.list_member_campaign_notes_ui(player,campaign,parent_private);
 IF ct<>0 THEN RAISE EXCEPTION 'Revoked author still sees private subtab';END IF;
 IF has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.campaign_notes','SELECT')
 THEN RAISE EXCEPTION 'Runtime gained raw Note access';END IF;
END $$;
ROLLBACK;
