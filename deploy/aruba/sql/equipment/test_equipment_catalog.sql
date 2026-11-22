BEGIN;
DO $$ DECLARE owner_id uuid:=gen_random_uuid(); other_id uuid:=gen_random_uuid(); campaign_id uuid; item_id uuid:=gen_random_uuid(); result_id uuid; payload jsonb; BEGIN
 INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source) VALUES(owner_id,'equipment-owner-'||owner_id||'@example.org','Owner','active',now(),'local'),(other_id,'equipment-other-'||other_id||'@example.org','Other','active',now(),'local');
 SELECT hollowgate_vtt.create_owned_campaign(owner_id,'Equipment test','','hsc') INTO campaign_id;
 payload:=jsonb_build_object('id',item_id::text,'campaignId',campaign_id::text,'name','Lanterna','type','risorsa');
 SELECT hollowgate_vtt.save_owned_equipment_catalog(other_id,campaign_id,item_id,payload) INTO result_id; IF result_id IS NOT NULL THEN RAISE EXCEPTION 'Foreign owner wrote equipment'; END IF;
 SELECT hollowgate_vtt.save_owned_equipment_catalog(owner_id,campaign_id,item_id,payload) INTO result_id; IF result_id IS DISTINCT FROM item_id THEN RAISE EXCEPTION 'Owner equipment write failed'; END IF;
 IF (SELECT count(*) FROM hollowgate_vtt.list_owned_equipment_catalog(owner_id,campaign_id))<>1 OR (SELECT count(*) FROM hollowgate_vtt.list_owned_equipment_catalog(other_id,campaign_id))<>0 THEN RAISE EXCEPTION 'Equipment owner isolation failed'; END IF;
 SELECT hollowgate_vtt.save_owned_equipment_catalog(owner_id,campaign_id,item_id,jsonb_set(payload,'{campaignId}',to_jsonb(gen_random_uuid()::text))) INTO result_id; IF result_id IS NOT NULL THEN RAISE EXCEPTION 'Forged campaign accepted'; END IF;
 SELECT hollowgate_vtt.delete_owned_equipment_catalog(other_id,campaign_id,item_id) INTO result_id; IF result_id IS NOT NULL THEN RAISE EXCEPTION 'Foreign delete accepted'; END IF;
 SELECT hollowgate_vtt.delete_owned_equipment_catalog(owner_id,campaign_id,item_id) INTO result_id; IF result_id IS DISTINCT FROM item_id THEN RAISE EXCEPTION 'Owner delete failed'; END IF;
 IF has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.equipment_catalog_documents','SELECT') THEN RAISE EXCEPTION 'Runtime has direct equipment table access'; END IF;
END $$;
ROLLBACK;
