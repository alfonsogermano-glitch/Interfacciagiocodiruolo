-- Campaign branding regression: only the owner may set/clear references; a
-- referenced asset must belong to the same campaign; active members may read
-- branding content, outsiders, foreign campaigns and revoked members may not.
BEGIN;
DO $$
DECLARE v_owner uuid:=gen_random_uuid();v_player uuid:=gen_random_uuid();
 v_outsider uuid:=gen_random_uuid();c1 uuid;c2 uuid;
 logo uuid:=gen_random_uuid();cover uuid:=gen_random_uuid();
 logo2 uuid:=gen_random_uuid();cover2 uuid:=gen_random_uuid();
 foreign_asset uuid:=gen_random_uuid();saved uuid;changed uuid;ok boolean;n integer;
BEGIN
 INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source)
 VALUES(v_owner,'branding-owner@example.org','GM','active',now(),'local'),
  (v_player,'branding-player@example.org','Player','active',now(),'local'),
  (v_outsider,'branding-outsider@example.org','Outsider','active',now(),'local');
 SELECT hollowgate_vtt.create_owned_campaign(v_owner,'Branding campaign','','hsc') INTO c1;
 SELECT hollowgate_vtt.create_owned_campaign(v_owner,'Foreign branding','','hsc') INTO c2;
 SELECT hollowgate_vtt.save_owned_visual_asset(v_owner,c1,logo,'Logo','other',
  'image/png',decode('89504e470a','hex'),'image/png',decode('0a','hex')) INTO saved;
 SELECT hollowgate_vtt.save_owned_visual_asset(v_owner,c1,cover,'Copertina','other',
  'image/png',decode('89504e470b','hex'),'image/png',decode('0b','hex')) INTO saved;
 SELECT hollowgate_vtt.save_owned_visual_asset(v_owner,c1,logo2,'Logo 2','other',
  'image/png',decode('89504e470c','hex'),'image/png',decode('0c','hex')) INTO saved;
 SELECT hollowgate_vtt.save_owned_visual_asset(v_owner,c1,cover2,'Copertina 2','other',
  'image/png',decode('89504e470d','hex'),'image/png',decode('0d','hex')) INTO saved;
 SELECT hollowgate_vtt.save_owned_visual_asset(v_owner,c2,foreign_asset,'Estraneo','other',
  'image/png',decode('89504e470e','hex'),'image/png',decode('0e','hex')) INTO saved;
 SELECT hollowgate_vtt.set_campaign_membership(v_owner,c1,v_player,'player',true) INTO changed;
 IF v_player IS NULL OR NOT EXISTS(
   SELECT 1 FROM hollowgate_vtt.campaign_members m
   WHERE m.campaign_id=c1 AND m.user_id=v_player AND m.status='active' AND m.member_role='player'
 ) THEN RAISE EXCEPTION 'Test prerequisite membership failed'; END IF;

 -- Player and outsider cannot write branding.
 SELECT count(*) INTO n FROM hollowgate_vtt.set_owned_campaign_branding(v_player,c1,logo,cover);
 IF n<>0 THEN RAISE EXCEPTION 'Player changed campaign branding'; END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.set_owned_campaign_branding(v_outsider,c1,logo,cover);
 IF n<>0 THEN RAISE EXCEPTION 'Outsider changed campaign branding'; END IF;

 -- Owner sets both references.
 SELECT count(*) INTO n FROM hollowgate_vtt.set_owned_campaign_branding(v_owner,c1,logo,cover)
  WHERE logo_asset_id=logo AND cover_asset_id=cover;
 IF n<>1 THEN RAISE EXCEPTION 'Owner branding update returned no row'; END IF;

 -- Owner and joined player lists expose the same references.
 IF NOT EXISTS(SELECT 1 FROM hollowgate_vtt.list_owned_campaigns(v_owner)
   WHERE id=c1 AND logo_asset_id=logo AND cover_asset_id=cover)
 THEN RAISE EXCEPTION 'Owner list lost branding references'; END IF;
 IF NOT EXISTS(SELECT 1 FROM hollowgate_vtt.list_joined_player_campaigns(v_player)
   WHERE id=c1 AND logo_asset_id=logo AND cover_asset_id=cover)
 THEN RAISE EXCEPTION 'Joined player list lost branding references'; END IF;

 -- Active member can read both branding binaries.
 SELECT count(*) INTO n FROM hollowgate_vtt.read_authorized_visual_asset(v_player,c1,logo)
  WHERE mime_type='image/png' AND source_data=decode('89504e470a','hex');
 IF n<>1 THEN RAISE EXCEPTION 'Member logo read failed'; END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.read_authorized_visual_asset(v_player,c1,cover)
  WHERE source_data=decode('89504e470b','hex');
 IF n<>1 THEN RAISE EXCEPTION 'Member cover read failed'; END IF;

 -- Outsider cannot read branding even with the exact id.
 IF EXISTS(SELECT 1 FROM hollowgate_vtt.read_authorized_visual_asset(v_outsider,c1,logo))
 THEN RAISE EXCEPTION 'Outsider read campaign branding'; END IF;
 -- Foreign campaign asset cannot be attached to this campaign.
 SELECT count(*) INTO n FROM hollowgate_vtt.set_owned_campaign_branding(v_owner,c1,foreign_asset,NULL);
 IF n<>0 THEN RAISE EXCEPTION 'Foreign campaign asset accepted as branding'; END IF;
 IF EXISTS(SELECT 1 FROM hollowgate_vtt.list_owned_campaigns(v_owner)
   WHERE id=c1 AND logo_asset_id=foreign_asset)
 THEN RAISE EXCEPTION 'Foreign asset id leaked into campaign branding'; END IF;
 IF EXISTS(SELECT 1 FROM hollowgate_vtt.read_authorized_visual_asset(v_player,c2,foreign_asset))
 THEN RAISE EXCEPTION 'Member read foreign campaign asset'; END IF;

 -- Deleting the logo clears only its pointer in the same transaction.
 SELECT hollowgate_vtt.delete_owned_visual_asset(v_owner,c1,logo) INTO saved;
 IF saved<>logo THEN RAISE EXCEPTION 'Logo deletion did not return the id'; END IF;
 IF EXISTS(SELECT 1 FROM hollowgate_vtt.list_owned_campaigns(v_owner)
   WHERE id=c1 AND logo_asset_id IS NOT NULL)
 THEN RAISE EXCEPTION 'Deleted logo reference was not cleared'; END IF;
 IF NOT EXISTS(SELECT 1 FROM hollowgate_vtt.list_owned_campaigns(v_owner)
   WHERE id=c1 AND cover_asset_id=cover)
 THEN RAISE EXCEPTION 'Cover reference was cleared by logo deletion'; END IF;
 IF EXISTS(SELECT 1 FROM hollowgate_vtt.read_authorized_visual_asset(v_player,c1,logo))
 THEN RAISE EXCEPTION 'Deleted logo content remained readable'; END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.read_authorized_visual_asset(v_player,c1,cover);
 IF n<>1 THEN RAISE EXCEPTION 'Cover read regressed after logo deletion'; END IF;

 -- Clearing both pointers removes member access to both binaries.
 SELECT count(*) INTO n FROM hollowgate_vtt.set_owned_campaign_branding(v_owner,c1,NULL,NULL)
  WHERE logo_asset_id IS NULL AND cover_asset_id IS NULL;
 IF n<>1 THEN RAISE EXCEPTION 'Branding clear failed'; END IF;
 IF EXISTS(SELECT 1 FROM hollowgate_vtt.read_authorized_visual_asset(v_player,c1,cover))
 THEN RAISE EXCEPTION 'Cleared cover remained readable'; END IF;

 -- Referenced again, then membership revocation closes member access.
 SELECT count(*) INTO n FROM hollowgate_vtt.set_owned_campaign_branding(v_owner,c1,logo2,cover2);
 IF n<>1 THEN RAISE EXCEPTION 'Branding restore failed'; END IF;
 SELECT hollowgate_vtt.set_campaign_membership(v_owner,c1,v_player,'player',false) INTO changed;
 IF EXISTS(SELECT 1 FROM hollowgate_vtt.read_authorized_visual_asset(v_player,c1,logo2))
 THEN RAISE EXCEPTION 'Revoked member read branding'; END IF;
 IF EXISTS(SELECT 1 FROM hollowgate_vtt.read_authorized_visual_asset(v_player,c1,cover2))
 THEN RAISE EXCEPTION 'Revoked member read cover branding'; END IF;

 -- Runtime role has no direct table access.
 IF has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.campaigns','SELECT')
 THEN RAISE EXCEPTION 'Runtime has direct campaigns table access'; END IF;
 IF has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.visual_assets','SELECT')
 THEN RAISE EXCEPTION 'Runtime has direct visual asset table access'; END IF;
END $$;
ROLLBACK;
