BEGIN;
DO $$ DECLARE owner_id uuid:=gen_random_uuid(); other_id uuid:=gen_random_uuid(); campaign_id uuid; asset_id uuid:=gen_random_uuid(); result_id uuid; rows int; BEGIN
 INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source) VALUES(owner_id,'content-owner-'||owner_id||'@example.org','Owner','active',now(),'local'),(other_id,'content-other-'||other_id||'@example.org','Other','active',now(),'local');
 SELECT hollowgate_vtt.create_owned_campaign(owner_id,'Content test','','hsc') INTO campaign_id;
 SELECT hollowgate_vtt.save_owned_visual_asset(owner_id,campaign_id,asset_id,'Cornice','frame','image/png',decode('89504e47','hex'),'image/png',decode('00','hex')) INTO result_id;
 IF result_id IS DISTINCT FROM asset_id THEN RAISE EXCEPTION 'Owner asset write failed'; END IF;
 SELECT count(*) INTO rows FROM hollowgate_vtt.read_owned_visual_asset(owner_id,campaign_id,asset_id) WHERE mime_type='image/png' AND source_data=decode('89504e47','hex');
 IF rows<>1 THEN RAISE EXCEPTION 'Owner content read failed'; END IF;
 IF EXISTS(SELECT 1 FROM hollowgate_vtt.read_owned_visual_asset(other_id,campaign_id,asset_id)) THEN RAISE EXCEPTION 'Foreign content read accepted'; END IF;
 IF EXISTS(SELECT 1 FROM hollowgate_vtt.read_owned_visual_asset(owner_id,gen_random_uuid(),asset_id)) THEN RAISE EXCEPTION 'Cross-campaign content read accepted'; END IF;
 IF has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.visual_assets','SELECT') THEN RAISE EXCEPTION 'Runtime has direct asset access'; END IF;
END $$;
ROLLBACK;
