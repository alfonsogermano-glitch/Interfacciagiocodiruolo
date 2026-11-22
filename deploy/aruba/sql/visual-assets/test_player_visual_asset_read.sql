-- Player-scoped visual asset regression: only assets referenced by the
-- player's CURRENTLY assigned, active and available sheet may be listed or
-- read. Owner reads keep working through the same content routine.
BEGIN;
DO $$
DECLARE v_owner uuid:=gen_random_uuid(); v_player uuid:=gen_random_uuid();
 v_other_player uuid:=gen_random_uuid(); c1 uuid;c2 uuid;ch uuid;
 a1 uuid:=gen_random_uuid();a2 uuid:=gen_random_uuid();
 a3 uuid:=gen_random_uuid();a4 uuid:=gen_random_uuid();a5 uuid:=gen_random_uuid();
 sheet jsonb; saved uuid; changed uuid; ok boolean;n integer;
BEGIN
 INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source)
 VALUES (v_owner,'visual-player-owner@example.org','GM','active',now(),'local'),
  (v_player,'visual-player-player@example.org','Player','active',now(),'local'),
  (v_other_player,'visual-player-other@example.org','Other player','active',now(),'local');
 SELECT hollowgate_vtt.create_owned_campaign(v_owner,'Visual campaign','','hsc') INTO c1;
 SELECT hollowgate_vtt.create_owned_campaign(v_owner,'Other visual campaign','','hsc') INTO c2;
 -- a1 portrait frame, a2 cover frame, a3 cover image; a4 is same-campaign
 -- but unreferenced; a5 belongs to the foreign campaign.
 SELECT hollowgate_vtt.save_owned_visual_asset(v_owner,c1,a1,'Cornice ritratto','portrait-frame',
  'image/png',decode('89504e4701','hex'),'image/png',decode('01','hex')) INTO saved;
 SELECT hollowgate_vtt.save_owned_visual_asset(v_owner,c1,a2,'Cornice cover','frame',
  'image/png',decode('89504e4702','hex'),'image/png',decode('02','hex')) INTO saved;
 SELECT hollowgate_vtt.save_owned_visual_asset(v_owner,c1,a3,'Copertina','other',
  'image/png',decode('89504e4703','hex'),'image/png',decode('03','hex')) INTO saved;
 SELECT hollowgate_vtt.save_owned_visual_asset(v_owner,c1,a4,'Non referenziato','frame',
  'image/png',decode('89504e4704','hex'),'image/png',decode('04','hex')) INTO saved;
 SELECT hollowgate_vtt.save_owned_visual_asset(v_owner,c2,a5,'Estraneo','other',
  'image/png',decode('89504e4705','hex'),'image/png',decode('05','hex')) INTO saved;

 SELECT hollowgate_vtt.set_campaign_membership(v_owner,c1,v_player,'player',true) INTO changed;
 SELECT hollowgate_vtt.set_campaign_membership(v_owner,c1,v_other_player,'player',true) INTO changed;
 SELECT hollowgate_vtt.create_character_draft(v_owner,c1,'Mara') INTO ch;
 sheet:=jsonb_build_object(
  'style','Jock','viaggio','Campione','ambiti','{}'::jsonb,
  'abilita','{}'::jsonb,'tratti','[]'::jsonb,'equipment','[]'::jsonb,
  'portraitFrameAssetId',a1::text,
  'coverFrameAssetId',a2::text,
  'coverImageUrl','/vtt/campaigns/'||c1::text||'/visual-assets/'||a3::text||'/content');
 SELECT hollowgate_vtt.save_owned_character_sheet(v_owner,c1,ch,'Mara',sheet) INTO changed;
 SELECT hollowgate_vtt.set_owned_character_availability(v_owner,c1,ch,true) INTO ok;
 SELECT hollowgate_vtt.set_owned_character_player_assignment(v_owner,c1,ch,v_player) INTO ok;
 IF NOT ok THEN RAISE EXCEPTION 'Test prerequisite assignment failed'; END IF;

 SELECT count(*) INTO n FROM hollowgate_vtt.list_assigned_player_visual_assets(v_player,c1);
 IF n<>3 THEN RAISE EXCEPTION 'Expected exactly three referenced assets, got %',n; END IF;
 IF NOT EXISTS(SELECT 1 FROM hollowgate_vtt.list_assigned_player_visual_assets(v_player,c1) WHERE id=a1)
  OR NOT EXISTS(SELECT 1 FROM hollowgate_vtt.list_assigned_player_visual_assets(v_player,c1) WHERE id=a2)
  OR NOT EXISTS(SELECT 1 FROM hollowgate_vtt.list_assigned_player_visual_assets(v_player,c1) WHERE id=a3)
 THEN RAISE EXCEPTION 'Referenced asset missing from player list'; END IF;
 IF EXISTS(SELECT 1 FROM hollowgate_vtt.list_assigned_player_visual_assets(v_player,c1) WHERE id=a4)
 THEN RAISE EXCEPTION 'Unreferenced asset leaked to player list'; END IF;

 SELECT count(*) INTO n FROM hollowgate_vtt.read_authorized_visual_asset(v_player,c1,a1)
  WHERE mime_type='image/png' AND source_data=decode('89504e4701','hex');
 IF n<>1 THEN RAISE EXCEPTION 'Assigned player frame read failed'; END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.read_authorized_visual_asset(v_player,c1,a3)
  WHERE source_data=decode('89504e4703','hex');
 IF n<>1 THEN RAISE EXCEPTION 'Assigned player cover read failed'; END IF;
 IF EXISTS(SELECT 1 FROM hollowgate_vtt.read_authorized_visual_asset(v_player,c1,a4))
 THEN RAISE EXCEPTION 'Unreferenced content read accepted'; END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.read_authorized_visual_asset(v_owner,c1,a4)
  WHERE source_data=decode('89504e4704','hex');
 IF n<>1 THEN RAISE EXCEPTION 'Owner content read regressed'; END IF;
 IF EXISTS(SELECT 1 FROM hollowgate_vtt.read_authorized_visual_asset(v_player,c2,a5))
 THEN RAISE EXCEPTION 'Foreign campaign content read accepted'; END IF;

 IF EXISTS(SELECT 1 FROM hollowgate_vtt.list_assigned_player_visual_assets(v_other_player,c1))
 THEN RAISE EXCEPTION 'Non-assigned player listed referenced assets'; END IF;
 IF EXISTS(SELECT 1 FROM hollowgate_vtt.read_authorized_visual_asset(v_other_player,c1,a1))
 THEN RAISE EXCEPTION 'Non-assigned player read referenced content'; END IF;

 -- A forged cover URL in the assigned sheet may point at a foreign asset id,
 -- but the campaign join inside the routines must deny it.
 sheet:=jsonb_set(sheet,'{coverImageUrl}',
  to_jsonb('/vtt/campaigns/'||c1::text||'/visual-assets/'||a5::text||'/content'));
 SELECT hollowgate_vtt.save_owned_character_sheet(v_owner,c1,ch,'Mara',sheet) INTO changed;
 IF EXISTS(SELECT 1 FROM hollowgate_vtt.list_assigned_player_visual_assets(v_player,c1) WHERE id=a5)
 THEN RAISE EXCEPTION 'Foreign asset id from forged URL leaked into list'; END IF;
 IF EXISTS(SELECT 1 FROM hollowgate_vtt.read_authorized_visual_asset(v_player,c1,a5))
 THEN RAISE EXCEPTION 'Foreign asset id from forged URL became readable'; END IF;

 -- Restore the valid reference, then make the sheet unavailable/archived.
 sheet:=jsonb_set(sheet,'{coverImageUrl}',
  to_jsonb('/vtt/campaigns/'||c1::text||'/visual-assets/'||a3::text||'/content'));
 SELECT hollowgate_vtt.save_owned_character_sheet(v_owner,c1,ch,'Mara',sheet) INTO changed;
 SELECT hollowgate_vtt.set_owned_character_availability(v_owner,c1,ch,false) INTO ok;
 IF EXISTS(SELECT 1 FROM hollowgate_vtt.list_assigned_player_visual_assets(v_player,c1))
 THEN RAISE EXCEPTION 'Unavailable sheet exposed visual assets'; END IF;
 IF EXISTS(SELECT 1 FROM hollowgate_vtt.read_authorized_visual_asset(v_player,c1,a1))
 THEN RAISE EXCEPTION 'Unavailable sheet exposed visual content'; END IF;
 SELECT hollowgate_vtt.set_owned_character_availability(v_owner,c1,ch,true) INTO ok;

 -- Membership revocation deletes the assignment through trigger 028.
 SELECT hollowgate_vtt.set_campaign_membership(v_owner,c1,v_player,'player',false) INTO changed;
 IF EXISTS(SELECT 1 FROM hollowgate_vtt.list_assigned_player_visual_assets(v_player,c1))
 THEN RAISE EXCEPTION 'Revoked player listed visual assets'; END IF;
 IF EXISTS(SELECT 1 FROM hollowgate_vtt.read_authorized_visual_asset(v_player,c1,a1))
 THEN RAISE EXCEPTION 'Revoked player read visual content'; END IF;

 IF has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.visual_assets','SELECT')
 THEN RAISE EXCEPTION 'Runtime has direct visual asset table access'; END IF;
END $$;
ROLLBACK;
