BEGIN;
DO $$
DECLARE owner uuid:=gen_random_uuid();player uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();
 c uuid;joined uuid;digest_a bytea;digest_b bytea;
BEGIN
 INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source) VALUES
  (owner,'invite-owner@example.org','Owner','active',now(),'local'),
  (player,'invite-player@example.org','Player','active',now(),'local'),
  (outsider,'invite-outsider@example.org','Outsider','active',now(),'local');
 SELECT hollowgate_vtt.create_owned_campaign(owner,'Inviti','Test','hsc') INTO c;
 digest_a:=decode(repeat('11',32),'hex');digest_b:=decode(repeat('22',32),'hex');
 IF hollowgate_vtt.rotate_owned_campaign_invite(player,c,digest_a,now()+interval '7 days') IS NOT NULL THEN
  RAISE EXCEPTION 'Non-owner rotated invite';END IF;
 IF hollowgate_vtt.rotate_owned_campaign_invite(owner,c,digest_a,now()+interval '7 days') IS DISTINCT FROM c THEN
  RAISE EXCEPTION 'Owner invite rotation failed';END IF;
 IF NOT EXISTS(SELECT 1 FROM hollowgate_vtt.preview_campaign_invite(player,digest_a) p WHERE p.id=c) THEN
  RAISE EXCEPTION 'Player preview failed';END IF;
 IF EXISTS(SELECT 1 FROM hollowgate_vtt.preview_campaign_invite(owner,digest_a)) THEN
  RAISE EXCEPTION 'Owner preview allowed';END IF;
 SELECT id INTO joined FROM hollowgate_vtt.join_campaign_by_invite(player,digest_a);
 IF joined IS DISTINCT FROM c OR hollowgate_vtt.campaign_member_role(player,c) IS DISTINCT FROM 'player' THEN
  RAISE EXCEPTION 'Atomic join failed';END IF;
 IF hollowgate_vtt.rotate_owned_campaign_invite(owner,c,digest_b,now()+interval '7 days') IS DISTINCT FROM c THEN
  RAISE EXCEPTION 'Invite replacement failed';END IF;
 IF EXISTS(SELECT 1 FROM hollowgate_vtt.preview_campaign_invite(outsider,digest_a)) THEN
  RAISE EXCEPTION 'Replaced invite remained active';END IF;
 IF NOT EXISTS(SELECT 1 FROM hollowgate_vtt.preview_campaign_invite(outsider,digest_b)) THEN
  RAISE EXCEPTION 'Replacement invite unavailable';END IF;
 UPDATE hollowgate_auth.users SET status='disabled' WHERE id=outsider;
 IF EXISTS(SELECT 1 FROM hollowgate_vtt.join_campaign_by_invite(outsider,digest_b)) THEN
  RAISE EXCEPTION 'Disabled user joined';END IF;
 IF has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.campaign_invites','SELECT')
  OR has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.campaign_invites','INSERT')
  OR has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.campaign_invites','UPDATE') THEN
  RAISE EXCEPTION 'Runtime received invite table privileges';END IF;
END $$;
ROLLBACK;
