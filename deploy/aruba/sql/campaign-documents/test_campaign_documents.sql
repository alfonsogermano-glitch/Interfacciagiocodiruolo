BEGIN;
DO $$ DECLARE owner_id uuid:=gen_random_uuid(); other_id uuid:=gen_random_uuid(); campaign_id uuid; ok boolean; BEGIN
 INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source) VALUES(owner_id,'documents-owner-'||owner_id||'@example.org','Owner','active',now(),'local'),(other_id,'documents-other-'||other_id||'@example.org','Other','active',now(),'local');
 SELECT hollowgate_vtt.create_owned_campaign(owner_id,'Documents test','','hsc') INTO campaign_id;
 SELECT hollowgate_vtt.save_owned_campaign_document(other_id,campaign_id,'map','{"locations":[],"mapNotes":""}'::jsonb) INTO ok; IF ok THEN RAISE EXCEPTION 'Foreign document write accepted'; END IF;
 SELECT hollowgate_vtt.save_owned_campaign_document(owner_id,campaign_id,'map','{"locations":[],"mapNotes":"Atrio"}'::jsonb) INTO ok; IF NOT ok THEN RAISE EXCEPTION 'Owner document write failed'; END IF;
 SELECT hollowgate_vtt.save_owned_campaign_document(owner_id,campaign_id,'active-scene','{"campaignId":"00000000-0000-4000-8000-000000000000"}'::jsonb) INTO ok; IF NOT ok THEN RAISE EXCEPTION 'Active scene document write failed'; END IF;
 SELECT hollowgate_vtt.save_owned_campaign_document(owner_id,campaign_id,'session-map-tokens','{}'::jsonb) INTO ok; IF NOT ok THEN RAISE EXCEPTION 'Session map document write failed'; END IF;
 IF (SELECT count(*) FROM hollowgate_vtt.read_owned_campaign_document(owner_id,campaign_id,'map'))<>1 OR (SELECT count(*) FROM hollowgate_vtt.read_owned_campaign_document(other_id,campaign_id,'map'))<>0 THEN RAISE EXCEPTION 'Document isolation failed'; END IF;
 SELECT hollowgate_vtt.save_owned_campaign_document(owner_id,campaign_id,'unknown','{}'::jsonb) INTO ok; IF ok THEN RAISE EXCEPTION 'Unknown key accepted'; END IF;
 IF has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.campaign_documents','SELECT') THEN RAISE EXCEPTION 'Runtime has direct campaign document access'; END IF;
END $$;
ROLLBACK;
