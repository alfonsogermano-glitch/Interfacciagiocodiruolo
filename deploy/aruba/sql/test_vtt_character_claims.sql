BEGIN;
DO $$
DECLARE gm uuid:=gen_random_uuid();player uuid:=gen_random_uuid();rival uuid:=gen_random_uuid();
 campaign uuid;character_a uuid;character_b uuid;result uuid;n integer;changed boolean;
 sheet jsonb:='{"style":"Jock","viaggio":"Campione","ambiti":{},"abilita":{},"tratti":[],"equipment":[]}'::jsonb;
BEGIN
 INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source) VALUES
 (gm,'claim-gm@example.org','Claim GM','active',now(),'local'),
 (player,'claim-player@example.org','Claim Player','active',now(),'local'),
 (rival,'claim-rival@example.org','Claim Rival','active',now(),'local');
 SELECT hollowgate_vtt.create_owned_campaign(gm,'Claim campaign','','hsc') INTO campaign;
 SELECT hollowgate_vtt.set_campaign_membership(gm,campaign,player,'player',true) INTO result;
 SELECT hollowgate_vtt.create_character_draft(gm,campaign,'Available A') INTO character_a;
 SELECT hollowgate_vtt.create_character_draft(gm,campaign,'Available B') INTO character_b;
 SELECT hollowgate_vtt.save_owned_character_sheet(gm,campaign,character_a,'Available A',sheet) INTO result;
 SELECT hollowgate_vtt.save_owned_character_sheet(gm,campaign,character_b,'Available B',sheet) INTO result;
 SELECT hollowgate_vtt.set_owned_character_availability(gm,campaign,character_a,true) INTO changed;
 SELECT hollowgate_vtt.set_owned_character_availability(gm,campaign,character_b,true) INTO changed;
 IF hollowgate_vtt.claim_available_character(rival,character_a) IS NOT NULL THEN RAISE EXCEPTION 'Non-member claimed PG';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_claimable_characters(player,campaign);
 IF n<>2 THEN RAISE EXCEPTION 'Player cannot list claimable PGs';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_claimable_characters(rival,campaign);
 IF n<>0 THEN RAISE EXCEPTION 'Non-member listed claimable PGs';END IF;
 SELECT hollowgate_vtt.claim_available_character(player,character_a) INTO result;
 IF result IS DISTINCT FROM campaign THEN RAISE EXCEPTION 'Valid claim rejected';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.get_player_character_claim(player,campaign) WHERE character_id=character_a;
 IF n<>1 THEN RAISE EXCEPTION 'Current player claim not visible';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_claimable_characters(player,campaign);
 IF n<>0 THEN RAISE EXCEPTION 'Player with a claim can list another PG';END IF;
 IF hollowgate_vtt.claim_available_character(player,character_b) IS NOT NULL THEN RAISE EXCEPTION 'Player claimed second campaign PG';END IF;
 IF hollowgate_vtt.claim_available_character(rival,character_a) IS NOT NULL THEN RAISE EXCEPTION 'Claimed PG won twice';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_assigned_player_character_sheets(player,campaign) WHERE id=character_a;
 IF n<>1 THEN RAISE EXCEPTION 'Claimed PG not readable by player';END IF;
 SELECT hollowgate_vtt.save_claimed_character_sheet(player,campaign,character_a,'Player A',sheet||'{"description":"owned"}'::jsonb) INTO result;
 IF result IS DISTINCT FROM character_a THEN RAISE EXCEPTION 'Claimed player save rejected';END IF;
 IF NOT hollowgate_vtt.save_authorized_character_portrait(player,campaign,character_a,'image/png',decode('89504e470d0a1a0a00000000','hex')) THEN RAISE EXCEPTION 'Claimed portrait save rejected';END IF;
 SELECT hollowgate_vtt.release_claimed_character(player,character_a) INTO result;
 IF result IS DISTINCT FROM campaign THEN RAISE EXCEPTION 'Release rejected';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.character_claims WHERE character_id=character_a;
 IF n<>0 THEN RAISE EXCEPTION 'Release retained claim';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.get_player_character_claim(player,campaign);
 IF n<>0 THEN RAISE EXCEPTION 'Released claim still reported';END IF;
 IF hollowgate_vtt.save_authorized_character_portrait(player,campaign,character_a,'image/png',decode('89504e470d0a1a0a00000000','hex')) THEN RAISE EXCEPTION 'Released player saved portrait';END IF;
 IF NOT hollowgate_vtt.save_authorized_character_portrait(gm,campaign,character_a,'image/png',decode('89504e470d0a1a0a00000000','hex')) THEN RAISE EXCEPTION 'GM portrait save rejected';END IF;
 SELECT hollowgate_vtt.claim_available_character(player,character_a) INTO result;
 SELECT hollowgate_vtt.set_campaign_membership(gm,campaign,player,'player',false) INTO result;
 SELECT count(*) INTO n FROM hollowgate_vtt.character_claims WHERE character_id=character_a;
 IF n<>0 THEN RAISE EXCEPTION 'Revocation retained claim';END IF;
 IF hollowgate_vtt.save_claimed_character_sheet(player,campaign,character_a,'Stale',sheet) IS NOT NULL THEN RAISE EXCEPTION 'Revoked player saved PG';END IF;
 IF has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.character_claims','SELECT')
  OR has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.character_claims','INSERT')
  OR has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.character_claims','UPDATE')
  OR has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.character_claims','DELETE')
 THEN RAISE EXCEPTION 'Runtime can access claim table directly';END IF;
END $$;
ROLLBACK;
