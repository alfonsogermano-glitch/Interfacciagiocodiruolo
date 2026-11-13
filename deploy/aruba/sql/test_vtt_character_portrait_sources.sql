BEGIN;
DO $$
DECLARE gm uuid:=gen_random_uuid();other uuid:=gen_random_uuid();player uuid:=gen_random_uuid();
 c uuid;d uuid;member uuid;ok boolean;n integer;
 source bytea:=decode('ffd8ffe000104a4649460001ffd9','hex');
BEGIN
 INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source)
 VALUES(gm,'source-gm@example.org','Source GM','active',now(),'local'),
 (other,'source-other@example.org','Another GM','active',now(),'local'),
 (player,'source-player@example.org','Player','active',now(),'local');
 SELECT hollowgate_vtt.create_owned_campaign(gm,'Source test','','hsc') INTO c;
 SELECT hollowgate_vtt.create_character_draft(gm,c,'Source PG') INTO d;
 SELECT hollowgate_vtt.save_owned_character_portrait_source(other,c,d,'image/jpeg',source) INTO ok;
 IF ok THEN RAISE EXCEPTION 'Foreign source write allowed'; END IF;
 SELECT hollowgate_vtt.save_owned_character_portrait_source(gm,c,d,'image/png',source) INTO ok;
 IF ok THEN RAISE EXCEPTION 'Non-JPEG source accepted'; END IF;
 SELECT hollowgate_vtt.save_owned_character_portrait_source(gm,c,d,'image/jpeg',source) INTO ok;
 IF NOT ok THEN RAISE EXCEPTION 'Owner source write failed'; END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.read_owned_character_portrait_source(gm,c,d) WHERE bytes=source;
 IF n<>1 THEN RAISE EXCEPTION 'Owner source read failed'; END IF;
 SELECT hollowgate_vtt.save_owned_character_sheet(gm,c,d,'Source PG',
 '{"style":"Jock","viaggio":"Campione","ambiti":{},"abilita":{},"tratti":[],"equipment":[]}'::jsonb) INTO member;
 SELECT hollowgate_vtt.set_campaign_membership(gm,c,player,'player',true) INTO member;
 SELECT hollowgate_vtt.set_owned_character_availability(gm,c,d,true) INTO ok;
 SELECT hollowgate_vtt.set_owned_character_player_assignment(gm,c,d,player) INTO ok;
 SELECT count(*) INTO n FROM hollowgate_vtt.read_owned_character_portrait_source(player,c,d);
 IF n<>0 THEN RAISE EXCEPTION 'Source exposed to assigned player'; END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.read_owned_character_portrait_source(other,c,d);
 IF n<>0 THEN RAISE EXCEPTION 'Foreign GM sees source'; END IF;
 IF has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.character_portrait_sources','SELECT') OR
 has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.character_portrait_sources','INSERT')
 THEN RAISE EXCEPTION 'Runtime has direct binary privileges'; END IF;
END $$;
ROLLBACK;
