-- Execute ONLY on the disposable campaign-recovery clone. All QA rows roll
-- back. Existing staging login is used, no new/shared role membership created.
BEGIN;
DO $$ BEGIN
  IF current_database() <> 'hollowgate_stage_campaign_verify_20261121' THEN
    RAISE EXCEPTION 'Wrong recovery clone database';
  END IF;
END $$;
CREATE TEMP TABLE hg_campaign_qa_context (name text PRIMARY KEY,id uuid) ON COMMIT DROP;
DO $$
DECLARE owner_id uuid:=gen_random_uuid();player_id uuid:=gen_random_uuid();
  outsider_id uuid:=gen_random_uuid();campaign_id uuid;private_id uuid;
BEGIN
  INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source)
    VALUES(owner_id,'qa-owner-'||owner_id||'@example.invalid','QA owner','active',now(),'local'),
          (player_id,'qa-player-'||player_id||'@example.invalid','QA player','active',now(),'local'),
          (outsider_id,'qa-outsider-'||outsider_id||'@example.invalid','QA outsider','active',now(),'local');
  campaign_id:=hollowgate_vtt.create_owned_campaign(owner_id,'QA clone invited','','hsc');
  private_id:=hollowgate_vtt.create_owned_campaign(outsider_id,'QA clone private','','hsc');
  INSERT INTO hg_campaign_qa_context VALUES('owner',owner_id),('player',player_id),
    ('outsider',outsider_id),('campaign',campaign_id),('private',private_id);
END $$;
GRANT SELECT ON hg_campaign_qa_context TO hollowgate_auth_staging_app;
SET LOCAL ROLE hollowgate_auth_staging_app;
DO $$
DECLARE owner_id uuid;player_id uuid;outsider_id uuid;campaign_id uuid;private_id uuid;
  digest bytea:=decode(repeat('73',32),'hex');joined uuid;n integer;
BEGIN
  IF current_user <> 'hollowgate_auth_staging_app' THEN RAISE EXCEPTION 'Wrong runtime role'; END IF;
  SELECT id INTO owner_id FROM hg_campaign_qa_context WHERE name='owner';
  SELECT id INTO player_id FROM hg_campaign_qa_context WHERE name='player';
  SELECT id INTO outsider_id FROM hg_campaign_qa_context WHERE name='outsider';
  SELECT id INTO campaign_id FROM hg_campaign_qa_context WHERE name='campaign';
  SELECT id INTO private_id FROM hg_campaign_qa_context WHERE name='private';
  IF hollowgate_vtt.rotate_owned_campaign_invite(player_id,campaign_id,digest,now()+interval '7 days') IS NOT NULL THEN
    RAISE EXCEPTION 'Player rotated invite'; END IF;
  IF hollowgate_vtt.rotate_owned_campaign_invite(owner_id,campaign_id,digest,now()+interval '7 days') IS DISTINCT FROM campaign_id THEN
    RAISE EXCEPTION 'Owner rotation failed'; END IF;
  SELECT id INTO joined FROM hollowgate_vtt.join_campaign_by_invite(player_id,digest);
  IF joined IS DISTINCT FROM campaign_id THEN RAISE EXCEPTION 'Restricted runtime join failed'; END IF;
  SELECT count(*) INTO n FROM hollowgate_vtt.list_joined_player_campaigns(player_id);
  IF n<>1 THEN RAISE EXCEPTION 'Joined discovery failed'; END IF;
  IF EXISTS(SELECT 1 FROM hollowgate_vtt.list_joined_player_campaigns(player_id) WHERE id=private_id) OR
     EXISTS(SELECT 1 FROM hollowgate_vtt.list_joined_player_campaigns(outsider_id)) THEN
    RAISE EXCEPTION 'Foreign campaign leaked'; END IF;
  IF hollowgate_vtt.set_campaign_membership(owner_id,campaign_id,player_id,'player',false) IS DISTINCT FROM player_id THEN
    RAISE EXCEPTION 'Membership revoke failed'; END IF;
  IF EXISTS(SELECT 1 FROM hollowgate_vtt.list_joined_player_campaigns(player_id)) THEN
    RAISE EXCEPTION 'Revoked campaign remains visible'; END IF;
  IF has_table_privilege(current_user,'hollowgate_vtt.campaign_members','SELECT') OR
     has_table_privilege(current_user,'hollowgate_vtt.campaign_members','INSERT') OR
     has_table_privilege(current_user,'hollowgate_vtt.campaign_invites','INSERT') THEN
    RAISE EXCEPTION 'Direct table grants are unsafe'; END IF;
END $$;
ROLLBACK;
