BEGIN;
DO $$
DECLARE owner_a uuid:=gen_random_uuid();owner_b uuid:=gen_random_uuid();
 player_a uuid:=gen_random_uuid();player_b uuid:=gen_random_uuid();
 c1 uuid;c2 uuid;changed uuid;n integer;
BEGIN
 INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source)
 VALUES(owner_a,'joined-gm-a@example.org','GM A','active',now(),'local'),
 (owner_b,'joined-gm-b@example.org','GM B','active',now(),'local'),
 (player_a,'joined-player-a@example.org','Player A','active',now(),'local'),
 (player_b,'joined-player-b@example.org','Player B','active',now(),'local');
 SELECT hollowgate_vtt.create_owned_campaign(owner_a,'Joined one','','hsc') INTO c1;
 SELECT hollowgate_vtt.create_owned_campaign(owner_b,'Private two','','hsc') INTO c2;
 SELECT hollowgate_vtt.set_campaign_membership(owner_a,c1,player_a,'player',true) INTO changed;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_joined_player_campaigns(player_a)
 WHERE id=c1 AND owner_id=owner_a AND name='Joined one';
 IF n<>1 THEN RAISE EXCEPTION 'Current joined player cannot see campaign';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_joined_player_campaigns(player_a) WHERE id=c2;
 IF n<>0 THEN RAISE EXCEPTION 'Foreign campaign exposed to player';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_joined_player_campaigns(player_b);
 IF n<>0 THEN RAISE EXCEPTION 'Non-member enumerated campaign';END IF;
 SELECT hollowgate_vtt.set_campaign_membership(owner_a,c1,player_a,'gm',true) INTO changed;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_joined_player_campaigns(player_a);
 IF n<>0 THEN RAISE EXCEPTION 'Co-GM treated as player';END IF;
 SELECT hollowgate_vtt.set_campaign_membership(owner_a,c1,player_a,'player',true) INTO changed;
 SELECT hollowgate_vtt.set_campaign_membership(owner_a,c1,player_a,'player',false) INTO changed;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_joined_player_campaigns(player_a);
 IF n<>0 THEN RAISE EXCEPTION 'Revoked membership still visible';END IF;
 IF has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.campaign_members','SELECT')
 THEN RAISE EXCEPTION 'Runtime can read membership table';END IF;
END $$;
ROLLBACK;
