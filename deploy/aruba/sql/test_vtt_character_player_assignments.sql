-- Assignment regression: campaign scope, active player, ownership, revocation.
BEGIN;
DO $$
DECLARE owner_a uuid:=gen_random_uuid();owner_b uuid:=gen_random_uuid();
 player_a uuid:=gen_random_uuid();player_b uuid:=gen_random_uuid();
 c_a uuid;c_b uuid;ch uuid;result_id uuid;found boolean;n integer;
BEGIN
 INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source)
 VALUES(owner_a,'assignment-owner-a@example.org','GM A','active',now(),'local'),
 (owner_b,'assignment-owner-b@example.org','GM B','active',now(),'local'),
 (player_a,'assignment-player-a@example.org','Player A','active',now(),'local'),
 (player_b,'assignment-player-b@example.org','Player B','active',now(),'local');
 SELECT hollowgate_vtt.create_owned_campaign(owner_a,'Campaign A','','hsc') INTO c_a;
 SELECT hollowgate_vtt.create_owned_campaign(owner_b,'Campaign B','','hsc') INTO c_b;
 SELECT hollowgate_vtt.set_campaign_membership(owner_a,c_a,player_a,'player',true) INTO result_id;
 SELECT hollowgate_vtt.set_campaign_membership(owner_b,c_b,player_b,'player',true) INTO result_id;
 SELECT hollowgate_vtt.create_character_draft(owner_a,c_a,'PG for assignment') INTO ch;
 SELECT hollowgate_vtt.set_owned_character_player_assignment(owner_a,c_a,ch,player_a) INTO found;
 IF found THEN RAISE EXCEPTION 'Draft assigned without active sheet';END IF;
 SELECT hollowgate_vtt.save_owned_character_sheet(owner_a,c_a,ch,'PG',
 '{"style":"Jock","viaggio":"Campione","ambiti":{},"abilita":{},"tratti":[],"equipment":[]}'::jsonb) INTO result_id;
 SELECT hollowgate_vtt.set_owned_character_player_assignment(owner_a,c_a,ch,player_a) INTO found;
 IF found THEN RAISE EXCEPTION 'Unavailable character assigned';END IF;
 SELECT hollowgate_vtt.set_owned_character_availability(owner_a,c_a,ch,true) INTO found;
 IF NOT found THEN RAISE EXCEPTION 'Owner cannot publish PG';END IF;
 SELECT hollowgate_vtt.set_owned_character_player_assignment(owner_b,c_a,ch,player_a) INTO found;
 IF found THEN RAISE EXCEPTION 'Foreign owner assigned PG';END IF;
 SELECT hollowgate_vtt.set_owned_character_player_assignment(owner_a,c_b,ch,player_a) INTO found;
 IF found THEN RAISE EXCEPTION 'Cross-campaign PG assigned';END IF;
 SELECT hollowgate_vtt.set_owned_character_player_assignment(owner_a,c_a,ch,player_b) INTO found;
 IF found THEN RAISE EXCEPTION 'Foreign member assigned PG';END IF;
 SELECT hollowgate_vtt.set_owned_character_player_assignment(owner_a,c_a,ch,player_a) INTO found;
 IF NOT found THEN RAISE EXCEPTION 'Valid assignment rejected';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_owned_character_player_assignments(owner_a,c_a)
 WHERE character_id=ch AND player_id=player_a;
 IF n<>1 THEN RAISE EXCEPTION 'Valid assignment missing';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_owned_character_player_assignments(owner_b,c_a);
 IF n<>0 THEN RAISE EXCEPTION 'Other GM can enumerate assignments';END IF;
 SELECT hollowgate_vtt.set_campaign_membership(owner_a,c_a,player_a,'player',false) INTO result_id;
 SELECT count(*) INTO n FROM hollowgate_vtt.character_player_assignments WHERE character_id=ch;
 IF n<>0 THEN RAISE EXCEPTION 'Revoked member retained assignment';END IF;
 SELECT hollowgate_vtt.set_campaign_membership(owner_a,c_a,player_a,'player',true) INTO result_id;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_owned_character_player_assignments(owner_a,c_a);
 IF n<>0 THEN RAISE EXCEPTION 'Membership reactivation silently restored assignment';END IF;
 SELECT hollowgate_vtt.set_owned_character_player_assignment(owner_a,c_a,ch,player_a) INTO found;
 IF NOT found THEN RAISE EXCEPTION 'Reassignment rejected';END IF;
 SELECT hollowgate_vtt.set_owned_character_player_assignment(owner_a,c_a,ch,NULL) INTO found;
 SELECT count(*) INTO n FROM hollowgate_vtt.character_player_assignments WHERE character_id=ch;
 IF NOT found OR n<>0 THEN RAISE EXCEPTION 'GM unassignment failed';END IF;
 IF has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.character_player_assignments','SELECT')
 OR has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.character_player_assignments','INSERT')
 OR has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.character_player_assignments','UPDATE')
 THEN RAISE EXCEPTION 'Runtime can access assignment table directly';END IF;
END $$;
ROLLBACK;
