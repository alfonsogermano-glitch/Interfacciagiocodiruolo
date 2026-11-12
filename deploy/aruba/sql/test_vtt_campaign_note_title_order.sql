BEGIN;
DO $$
DECLARE owner uuid:=gen_random_uuid();gm uuid:=gen_random_uuid();
 player uuid:=gen_random_uuid();rival uuid:=gen_random_uuid();
 campaign uuid;other_campaign uuid;root uuid;root_private uuid;
 first_child uuid;second_child uuid;foreign_note uuid;v uuid;ct integer;
BEGIN
 INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source)
 VALUES(owner,'ui23-owner@example.org','Owner','active',now(),'local'),
 (gm,'ui23-gm@example.org','GM','active',now(),'local'),
 (player,'ui23-player@example.org','Player','active',now(),'local'),
 (rival,'ui23-rival@example.org','Rival','active',now(),'local');
 SELECT hollowgate_vtt.create_owned_campaign(owner,'Notes title icons','','hsc') INTO campaign;
 SELECT hollowgate_vtt.create_owned_campaign(rival,'Foreign','','hsc') INTO other_campaign;
 SELECT hollowgate_vtt.set_campaign_membership(owner,campaign,gm,'gm',true) INTO v;
 SELECT hollowgate_vtt.set_campaign_membership(owner,campaign,player,'player',true) INTO v;
 SELECT hollowgate_vtt.create_member_campaign_note(player,campaign,'Public',NULL,'shared') INTO root;
 SELECT hollowgate_vtt.create_member_campaign_note(gm,campaign,'GM private',NULL,'gm') INTO root_private;
 SELECT hollowgate_vtt.create_member_campaign_note(player,campaign,'First',root,NULL) INTO first_child;
 SELECT hollowgate_vtt.create_member_campaign_note(gm,campaign,'Second',root,NULL) INTO second_child;
 SELECT hollowgate_vtt.create_owned_campaign_note(rival,other_campaign,'Foreign',NULL) INTO foreign_note;
 SELECT hollowgate_vtt.set_member_campaign_note_title_icon(player,campaign,root,'book-open') INTO v;
 IF v IS DISTINCT FROM root THEN RAISE EXCEPTION 'Author cannot set Note icon';END IF;
 SELECT count(*) INTO ct FROM hollowgate_vtt.list_member_campaign_notes_ui(player,campaign,NULL)
 WHERE id=root AND title_icon='book-open' AND tab_order IS NULL;
 IF ct<>1 THEN RAISE EXCEPTION 'Original NoteListRow metadata missing';END IF;
 SELECT hollowgate_vtt.set_member_campaign_note_title_icon(player,campaign,root_private,'lock') INTO v;
 IF v IS NOT NULL THEN RAISE EXCEPTION 'Player modified GM-only icon';END IF;
 SELECT hollowgate_vtt.set_member_campaign_note_title_icon(gm,campaign,root_private,'lock') INTO v;
 IF v IS DISTINCT FROM root_private THEN RAISE EXCEPTION 'GM cannot set secret icon';END IF;
 SELECT hollowgate_vtt.set_member_campaign_note_title_icon(gm,campaign,root,'pencil') INTO v;
 IF v IS DISTINCT FROM root THEN RAISE EXCEPTION 'GM cannot set player Note icon';END IF;
 SELECT hollowgate_vtt.set_member_campaign_note_title_icon(player,other_campaign,foreign_note,'lock') INTO v;
 IF v IS NOT NULL THEN RAISE EXCEPTION 'Cross-campaign icon change';END IF;
 SELECT hollowgate_vtt.set_member_campaign_note_title_icon(player,campaign,first_child,'lock') INTO v;
 IF v IS NOT NULL THEN RAISE EXCEPTION 'Leaf icon not tied to root UI';END IF;
 SELECT hollowgate_vtt.set_member_campaign_subtab_order(player,campaign,root,
  jsonb_build_array(second_child::text,first_child::text)) INTO v;
 IF v IS DISTINCT FROM root THEN RAISE EXCEPTION 'Parent author cannot reorder GM-added child';END IF;
 SELECT count(*) INTO ct FROM hollowgate_vtt.list_member_campaign_notes_ui(player,campaign,NULL)
 WHERE id=root AND tab_order=jsonb_build_array(second_child::text,first_child::text);
 IF ct<>1 THEN RAISE EXCEPTION 'Tab order not visible to original NoteSubTabs';END IF;
 BEGIN
  SELECT hollowgate_vtt.set_member_campaign_subtab_order(player,campaign,root,
   jsonb_build_array(first_child::text,first_child::text)) INTO v;
  RAISE EXCEPTION 'Duplicate IDs were accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
 END;
 BEGIN
  SELECT hollowgate_vtt.set_member_campaign_subtab_order(player,campaign,root,
   jsonb_build_array(first_child::text)) INTO v;
  RAISE EXCEPTION 'Incomplete order accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
 END;
 BEGIN
  SELECT hollowgate_vtt.set_member_campaign_subtab_order(player,campaign,root,
   jsonb_build_array(first_child::text,foreign_note::text)) INTO v;
  RAISE EXCEPTION 'Foreign subtab accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
 END;
 SELECT hollowgate_vtt.set_member_campaign_subtab_order(gm,campaign,root,
  jsonb_build_array(first_child::text,second_child::text)) INTO v;
 IF v IS DISTINCT FROM root THEN RAISE EXCEPTION 'GM cannot reorder tabs';END IF;
 SELECT hollowgate_vtt.set_member_campaign_subtab_order(player,campaign,root_private,'[]'::jsonb) INTO v;
 IF v IS NOT NULL THEN RAISE EXCEPTION 'Player reordered GM-only note';END IF;
 SELECT hollowgate_vtt.set_campaign_membership(owner,campaign,player,'player',false) INTO v;
 SELECT hollowgate_vtt.set_member_campaign_note_title_icon(player,campaign,root,'lock') INTO v;
 IF v IS NOT NULL THEN RAISE EXCEPTION 'Revoked player set icon';END IF;
 SELECT hollowgate_vtt.set_member_campaign_subtab_order(player,campaign,root,
  jsonb_build_array(first_child::text,second_child::text)) INTO v;
 IF v IS NOT NULL THEN RAISE EXCEPTION 'Revoked player reordered subtabs';END IF;
END $$;
ROLLBACK;
