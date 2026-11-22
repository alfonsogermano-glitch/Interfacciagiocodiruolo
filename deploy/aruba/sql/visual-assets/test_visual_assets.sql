BEGIN;
DO $$ DECLARE owner_id uuid:=gen_random_uuid(); other_id uuid:=gen_random_uuid(); campaign_id uuid; asset_id uuid:=gen_random_uuid(); result_id uuid; BEGIN
 INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source) VALUES(owner_id,'assets-owner-'||owner_id||'@example.org','Owner','active',now(),'local'),(other_id,'assets-other-'||other_id||'@example.org','Other','active',now(),'local');
 SELECT hollowgate_vtt.create_owned_campaign(owner_id,'Assets test','','hsc') INTO campaign_id;
 SELECT hollowgate_vtt.save_owned_visual_asset(other_id,campaign_id,asset_id,'Cornice','frame','image/png',decode('00','hex'),'image/png',decode('00','hex')) INTO result_id; IF result_id IS NOT NULL THEN RAISE EXCEPTION 'Foreign asset write accepted'; END IF;
 SELECT hollowgate_vtt.save_owned_visual_asset(owner_id,campaign_id,asset_id,'Cornice','frame','image/png',decode('00','hex'),'image/png',decode('00','hex')) INTO result_id; IF result_id IS DISTINCT FROM asset_id THEN RAISE EXCEPTION 'Owner asset write failed'; END IF;
 IF (SELECT count(*) FROM hollowgate_vtt.list_owned_visual_assets(owner_id,campaign_id))<>1 OR (SELECT count(*) FROM hollowgate_vtt.list_owned_visual_assets(other_id,campaign_id))<>0 THEN RAISE EXCEPTION 'Asset isolation failed'; END IF;
 IF has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.visual_assets','SELECT') THEN RAISE EXCEPTION 'Runtime has direct asset access'; END IF;
END $$;
ROLLBACK;
