-- 031: owner-only write; player read only while assignment, membership
-- and availability remain valid. Roll back all disposable fixtures.
BEGIN;
DO $$
DECLARE gm uuid:=gen_random_uuid();player uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();
 c uuid;d uuid;member uuid;ok boolean;n integer;
 payload bytea:=decode('89504e470d0a1a0a0000000d49484452','hex');
BEGIN
 INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source)
 VALUES(gm,'portrait-gm@example.org','GM','active',now(),'local'),
 (player,'portrait-player@example.org','Player','active',now(),'local'),
 (outsider,'portrait-outsider@example.org','Outsider','active',now(),'local');
 SELECT hollowgate_vtt.create_owned_campaign(gm,'Portrait QA','','hsc') INTO c;
 SELECT hollowgate_vtt.create_character_draft(gm,c,'Portrait PG') INTO d;
 SELECT hollowgate_vtt.save_owned_character_portrait(outsider,c,d,'image/png',payload) INTO ok;
 IF ok THEN RAISE EXCEPTION 'Foreign image write accepted';END IF;
 SELECT hollowgate_vtt.save_owned_character_portrait(gm,c,d,'image/png',payload) INTO ok;
 IF NOT ok THEN RAISE EXCEPTION 'GM portrait write failed';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.read_authorized_character_portrait(gm,c,d)
 WHERE mime_type='image/png' AND bytes=payload;
 IF n<>1 THEN RAISE EXCEPTION 'Owner cannot read portrait';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.read_authorized_character_portrait(player,c,d);
 IF n<>0 THEN RAISE EXCEPTION 'Draft exposed to player';END IF;
 SELECT hollowgate_vtt.save_owned_character_sheet(gm,c,d,'Portrait PG',
 '{"style":"Jock","viaggio":"Campione","ambiti":{},"abilita":{},"tratti":[],"equipment":[]}'::jsonb) INTO member;
 SELECT hollowgate_vtt.set_campaign_membership(gm,c,player,'player',true) INTO member;
 SELECT hollowgate_vtt.set_owned_character_availability(gm,c,d,true) INTO ok;
 SELECT hollowgate_vtt.set_owned_character_player_assignment(gm,c,d,player) INTO ok;
 SELECT count(*) INTO n FROM hollowgate_vtt.read_authorized_character_portrait(player,c,d);
 IF n<>1 THEN RAISE EXCEPTION 'Assigned player cannot read portrait';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.read_authorized_character_portrait(outsider,c,d);
 IF n<>0 THEN RAISE EXCEPTION 'Unrelated account read image';END IF;
 SELECT hollowgate_vtt.set_owned_character_availability(gm,c,d,false) INTO ok;
 SELECT count(*) INTO n FROM hollowgate_vtt.read_authorized_character_portrait(player,c,d);
 IF n<>0 THEN RAISE EXCEPTION 'Unavailable portrait exposed';END IF;
 SELECT hollowgate_vtt.set_owned_character_availability(gm,c,d,true) INTO ok;
 SELECT hollowgate_vtt.set_campaign_membership(gm,c,player,'player',false) INTO member;
 SELECT count(*) INTO n FROM hollowgate_vtt.read_authorized_character_portrait(player,c,d);
 IF n<>0 THEN RAISE EXCEPTION 'Revoked portrait exposed';END IF;
 IF has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.character_portraits','SELECT')
 OR has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.character_portraits','INSERT')
 THEN RAISE EXCEPTION 'Runtime can read or write media table';END IF;
END $$;
ROLLBACK;
