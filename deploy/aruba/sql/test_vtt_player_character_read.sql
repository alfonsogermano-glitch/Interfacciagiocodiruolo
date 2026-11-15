-- 029 security regression: no other player, foreign campaign, inactive
-- assignment, archived or unpublished sheet can be read.
BEGIN;
DO $$
DECLARE v_owner uuid:=gen_random_uuid(); v_other_owner uuid:=gen_random_uuid();
 v_player uuid:=gen_random_uuid();v_other_player uuid:=gen_random_uuid();
 c1 uuid;c2 uuid; ch uuid;other_ch uuid; changed uuid; ok boolean;n integer;
 sheet jsonb:='{"style":"Jock","viaggio":"Campione","ambiti":{},"abilita":{},"tratti":[],"equipment":[]}'::jsonb;
BEGIN
 INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source)
 VALUES (v_owner,'player-sheet-owner@example.org','GM','active',now(),'local'),
 (v_other_owner,'player-sheet-other-gm@example.org','Other GM','active',now(),'local'),
 (v_player,'player-sheet-player@example.org','Player','active',now(),'local'),
 (v_other_player,'player-sheet-other-player@example.org','Other player','active',now(),'local');
 SELECT hollowgate_vtt.create_owned_campaign(v_owner,'Campaign one','','hsc') INTO c1;
 SELECT hollowgate_vtt.create_owned_campaign(v_other_owner,'Campaign two','','hsc') INTO c2;
 SELECT hollowgate_vtt.set_campaign_membership(v_owner,c1,v_player,'player',true) INTO changed;
 SELECT hollowgate_vtt.set_campaign_membership(v_owner,c1,v_other_player,'player',true) INTO changed;
 SELECT hollowgate_vtt.create_character_draft(v_owner,c1,'Only for assigned player') INTO ch;
 SELECT hollowgate_vtt.save_owned_character_sheet(v_owner,c1,ch,'Mara',sheet) INTO changed;
 SELECT hollowgate_vtt.set_owned_character_availability(v_owner,c1,ch,true) INTO ok;
 SELECT hollowgate_vtt.set_owned_character_player_assignment(v_owner,c1,ch,v_player) INTO ok;
 IF NOT ok THEN RAISE EXCEPTION 'Test prerequisite assignment failed';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_assigned_player_character_sheets(v_player,c1)
 WHERE id=ch AND owner_id=v_owner AND sheet_data=sheet AND status='active';
 IF n<>1 THEN RAISE EXCEPTION 'Assigned player cannot read original sheet';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_assigned_player_character_sheets(v_other_player,c1);
 IF n<>0 THEN RAISE EXCEPTION 'Non-assigned member read sheet';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_assigned_player_character_sheets(v_other_owner,c1);
 IF n<>0 THEN RAISE EXCEPTION 'Other GM read sheet as player';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_assigned_player_character_sheets(v_player,c2);
 IF n<>0 THEN RAISE EXCEPTION 'Cross-campaign sheet leaked';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_assigned_player_character_sheets(v_owner,c1);
 IF n<>0 THEN RAISE EXCEPTION 'Owner received player sheet without assignment';END IF;
 SELECT hollowgate_vtt.set_owned_character_availability(v_owner,c1,ch,false) INTO ok;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_assigned_player_character_sheets(v_player,c1);
 IF n<>0 THEN RAISE EXCEPTION 'Unavailable sheet leaked to player';END IF;
 SELECT hollowgate_vtt.set_owned_character_availability(v_owner,c1,ch,true) INTO ok;
 SELECT hollowgate_vtt.set_campaign_membership(v_owner,c1,v_player,'player',false) INTO changed;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_assigned_player_character_sheets(v_player,c1);
 IF n<>0 THEN RAISE EXCEPTION 'Revoked player read assigned sheet';END IF;
 SELECT hollowgate_vtt.set_campaign_membership(v_owner,c1,v_player,'player',true) INTO changed;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_assigned_player_character_sheets(v_player,c1);
 IF n<>0 THEN RAISE EXCEPTION 'Reactivation restored access without reassignment';END IF;
 SELECT hollowgate_vtt.set_owned_character_player_assignment(v_owner,c1,ch,v_player) INTO ok;
 SELECT hollowgate_vtt.archive_owned_character(v_owner,c1,ch) INTO changed;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_assigned_player_character_sheets(v_player,c1);
 IF n<>0 THEN RAISE EXCEPTION 'Archived character sheet leaked';END IF;
 IF has_table_privilege('hollowgate_api_runtime',
   'hollowgate_vtt.character_player_assignments','SELECT')
 OR has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.character_drafts','SELECT')
 THEN RAISE EXCEPTION 'Runtime has direct character/assignment read access';END IF;
END $$;
ROLLBACK;
