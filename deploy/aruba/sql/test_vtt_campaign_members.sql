BEGIN;
DO $$
DECLARE v_owner uuid:=gen_random_uuid();v_player uuid:=gen_random_uuid();
 v_gm uuid:=gen_random_uuid();v_other uuid:=gen_random_uuid();
 v_unverified uuid:=gen_random_uuid();c1 uuid;c2 uuid;
 root_shared uuid;root_private uuid;child_shared uuid;child_private uuid;
 created uuid;id_result uuid;counter integer;
BEGIN
 INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source)
 VALUES
 (v_owner,'member-owner@example.org','Owner','active',now(),'local'),
 (v_player,'member-player@example.org','Player','active',now(),'local'),
 (v_gm,'member-gm@example.org','GM','active',now(),'local'),
 (v_other,'member-outsider@example.org','Outsider','active',now(),'local'),
 (v_unverified,'member-unverified@example.org','Unverified','active',NULL,'local');
 SELECT hollowgate_vtt.create_owned_campaign(v_owner,'Shared Campaign','','hsc') INTO c1;
 SELECT hollowgate_vtt.create_owned_campaign(v_other,'Other Campaign','','hsc') INTO c2;
 IF hollowgate_vtt.campaign_member_role(v_owner,c1) IS DISTINCT FROM 'gm' THEN
  RAISE EXCEPTION 'Owner must be GM in owned campaign';END IF;
 IF hollowgate_vtt.campaign_member_role(v_owner,c2) IS NOT NULL THEN
  RAISE EXCEPTION 'Owner inherited role in other campaign';END IF;
 SELECT hollowgate_vtt.set_campaign_membership(v_other,c1,v_player,'player',true) INTO id_result;
 IF id_result IS NOT NULL THEN RAISE EXCEPTION 'Foreign owner granted access';END IF;
 SELECT hollowgate_vtt.set_campaign_membership(v_owner,c1,v_unverified,'gm',true) INTO id_result;
 IF id_result IS NOT NULL THEN RAISE EXCEPTION 'Unverified member granted access';END IF;
 SELECT hollowgate_vtt.set_campaign_membership(v_owner,c1,v_owner,'player',true) INTO id_result;
 IF id_result IS NOT NULL THEN RAISE EXCEPTION 'Owner role overwritten';END IF;
 SELECT hollowgate_vtt.set_campaign_membership(v_owner,c1,v_player,'player',true) INTO id_result;
 IF id_result IS DISTINCT FROM v_player THEN RAISE EXCEPTION 'Player invite failed';END IF;
 SELECT hollowgate_vtt.set_campaign_membership(v_owner,c1,v_gm,'gm',true) INTO id_result;
 IF id_result IS DISTINCT FROM v_gm THEN RAISE EXCEPTION 'GM invite failed';END IF;
 IF hollowgate_vtt.campaign_member_role(v_player,c1) IS DISTINCT FROM 'player'
 OR hollowgate_vtt.campaign_member_role(v_gm,c1) IS DISTINCT FROM 'gm'
 OR hollowgate_vtt.campaign_member_role(v_player,c2) IS NOT NULL THEN
  RAISE EXCEPTION 'Membership campaign role leaked';END IF;
 SELECT hollowgate_vtt.create_owned_campaign_note(v_owner,c1,'Public parent',NULL) INTO root_shared;
 SELECT hollowgate_vtt.create_owned_campaign_note(v_owner,c1,'Private parent',NULL) INTO root_private;
 SELECT hollowgate_vtt.create_owned_campaign_note(v_owner,c1,'Public child',root_shared) INTO child_shared;
 SELECT hollowgate_vtt.create_owned_campaign_note(v_owner,c1,'Private child',root_private) INTO child_private;
 SELECT hollowgate_vtt.save_owned_campaign_note(v_owner,c1,root_shared,'Public parent',NULL,0,'all') INTO id_result;
 SELECT hollowgate_vtt.save_owned_campaign_note(v_owner,c1,child_shared,'Public child',NULL,0,'all') INTO id_result;
 SELECT hollowgate_vtt.save_owned_campaign_note(v_owner,c1,child_private,'Private child',NULL,0,'all') INTO id_result;
 -- A public child under a private parent must still remain private to others.
 SELECT count(*) INTO counter FROM hollowgate_vtt.list_member_campaign_notes(v_player,c1,NULL);
 IF counter<>1 THEN RAISE EXCEPTION 'Player saw private root';END IF;
 SELECT count(*) INTO counter FROM hollowgate_vtt.list_member_campaign_notes(v_player,c1,root_shared);
 IF counter<>1 THEN RAISE EXCEPTION 'Player cannot read shared child';END IF;
 SELECT count(*) INTO counter FROM hollowgate_vtt.list_member_campaign_notes(v_player,c1,root_private);
 IF counter<>0 THEN RAISE EXCEPTION 'Player leaked private parent children';END IF;
 SELECT count(*) INTO counter FROM hollowgate_vtt.list_member_campaign_notes(v_gm,c1,root_private);
 IF counter<>0 THEN RAISE EXCEPTION 'GM leaked creator private notes';END IF;
 SELECT count(*) INTO counter FROM hollowgate_vtt.list_member_campaign_notes(v_owner,c1,root_private);
 IF counter<>1 THEN RAISE EXCEPTION 'Owner cannot read private child';END IF;
 SELECT count(*) INTO counter FROM hollowgate_vtt.list_member_campaign_notes(v_other,c1,NULL);
 IF counter<>0 THEN RAISE EXCEPTION 'Outsider can enumerate campaign notes';END IF;
 -- A GM is a campaign-scoped role, not automatically a co-owner of owner-only write APIs.
 SELECT hollowgate_vtt.create_owned_campaign_note(v_gm,c1,'Forged GM write',NULL) INTO id_result;
 IF id_result IS NOT NULL THEN RAISE EXCEPTION 'GM bypassed owner-only write';END IF;
 SELECT hollowgate_vtt.set_campaign_membership(v_owner,c1,v_player,'player',false) INTO id_result;
 IF id_result IS DISTINCT FROM v_player THEN RAISE EXCEPTION 'Revocation failed';END IF;
 SELECT count(*) INTO counter FROM hollowgate_vtt.list_member_campaign_notes(v_player,c1,NULL);
 IF counter<>0 THEN RAISE EXCEPTION 'Revoked member still sees notes';END IF;
 SELECT hollowgate_vtt.set_campaign_membership(v_owner,c1,v_player,'player',true) INTO id_result;
 IF hollowgate_vtt.campaign_member_role(v_player,c1) IS DISTINCT FROM 'player' THEN
  RAISE EXCEPTION 'Reactivation failed';END IF;
 IF has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.campaign_members','SELECT')
 OR has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.campaign_members','INSERT')
 OR has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.campaign_members','UPDATE') THEN
  RAISE EXCEPTION 'Runtime received direct membership table privileges';END IF;
END $$;
ROLLBACK;
