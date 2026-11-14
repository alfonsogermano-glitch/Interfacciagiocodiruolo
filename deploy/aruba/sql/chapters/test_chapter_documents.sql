-- Run after chapters/001_chapter_documents.sql on isolated staging only.
-- All test fixtures are rolled back, including on success.
BEGIN;
DO $$
DECLARE
 v_owner uuid:=gen_random_uuid();
 v_other uuid:=gen_random_uuid();
 v_unverified uuid:=gen_random_uuid();
 v_campaign uuid;
 v_other_campaign uuid;
 v_chapter uuid:=gen_random_uuid();
 v_result uuid;
 v_payload jsonb;
BEGIN
 INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source)
 VALUES
 (v_owner,'chapter-owner-'||v_owner||'@example.org','Owner','active',now(),'local'),
 (v_other,'chapter-other-'||v_other||'@example.org','Other','active',now(),'local'),
 (v_unverified,'chapter-unverified-'||v_unverified||'@example.org','Unverified','active',NULL,'local');
 SELECT hollowgate_vtt.create_owned_campaign(v_owner,'Chapter test','','hsc') INTO v_campaign;
 SELECT hollowgate_vtt.create_owned_campaign(v_other,'Other chapter test','','hsc') INTO v_other_campaign;
 IF v_campaign IS NULL OR v_other_campaign IS NULL THEN RAISE EXCEPTION 'Campaign setup failed'; END IF;
 IF NOT hollowgate_vtt.chapter_owner_authorized(v_owner,v_campaign)
 OR hollowgate_vtt.chapter_owner_authorized(v_other,v_campaign)
 OR hollowgate_vtt.chapter_owner_authorized(v_unverified,v_campaign)
 THEN RAISE EXCEPTION 'Chapter owner authorization boundary failed'; END IF;
 v_payload:=jsonb_build_object('id',v_chapter::text,'campaignId',v_campaign::text,'title','Introduction');
 SELECT hollowgate_vtt.save_owned_chapter_document(v_other,v_campaign,v_chapter,v_payload) INTO v_result;
 IF v_result IS NOT NULL THEN RAISE EXCEPTION 'Foreign owner wrote chapter'; END IF;
 SELECT hollowgate_vtt.save_owned_chapter_document(v_owner,v_campaign,v_chapter,v_payload) INTO v_result;
 IF v_result IS DISTINCT FROM v_chapter THEN RAISE EXCEPTION 'Owner write failed'; END IF;
 IF (SELECT count(*) FROM hollowgate_vtt.list_owned_chapter_documents(v_owner,v_campaign))<>1
 OR (SELECT count(*) FROM hollowgate_vtt.list_owned_chapter_documents(v_other,v_campaign))<>0
 OR (SELECT count(*) FROM hollowgate_vtt.list_owned_chapter_links(v_other,v_campaign,ARRAY[v_chapter]))<>0
 THEN RAISE EXCEPTION 'Chapter read or link isolation failed'; END IF;
 SELECT hollowgate_vtt.save_owned_chapter_document(v_owner,v_campaign,v_chapter,
 jsonb_set(v_payload,'{campaignId}',to_jsonb(v_other_campaign::text))) INTO v_result;
 IF v_result IS NOT NULL THEN RAISE EXCEPTION 'Forged payload campaign accepted'; END IF;
 -- A forged chapter ID must not overwrite an existing document.
 SELECT hollowgate_vtt.save_owned_chapter_document(v_owner,v_campaign,v_chapter,
 jsonb_set(v_payload,'{id}',to_jsonb(gen_random_uuid()::text))) INTO v_result;
 IF v_result IS NOT NULL THEN RAISE EXCEPTION 'Forged payload chapter ID accepted'; END IF;
 -- Updating the owner's own chapter must replace its payload, not duplicate rows.
 SELECT hollowgate_vtt.save_owned_chapter_document(v_owner,v_campaign,v_chapter,
 jsonb_set(v_payload,'{title}',to_jsonb('Updated chapter'::text))) INTO v_result;
 IF v_result IS DISTINCT FROM v_chapter THEN RAISE EXCEPTION 'Owner chapter update failed'; END IF;
 IF (SELECT count(*) FROM hollowgate_vtt.list_owned_chapter_documents(v_owner,v_campaign))<>1
 OR (SELECT payload->>'title' FROM hollowgate_vtt.list_owned_chapter_documents(v_owner,v_campaign) LIMIT 1) IS DISTINCT FROM 'Updated chapter'
 THEN RAISE EXCEPTION 'Chapter update did not replace payload atomically'; END IF;
 -- A valid owner may not reuse an ID to overwrite a different campaign.
 SELECT hollowgate_vtt.save_owned_chapter_document(v_other,v_other_campaign,v_chapter,
 jsonb_set(v_payload,'{campaignId}',to_jsonb(v_other_campaign::text))) INTO v_result;
 IF v_result IS DISTINCT FROM v_chapter THEN RAISE EXCEPTION 'Second campaign chapter creation failed'; END IF;
 IF (SELECT count(*) FROM hollowgate_vtt.list_owned_chapter_documents(v_owner,v_campaign))<>1
 OR (SELECT count(*) FROM hollowgate_vtt.list_owned_chapter_documents(v_other,v_other_campaign))<>1
 THEN RAISE EXCEPTION 'Same chapter ID crossed campaign boundaries'; END IF;
 SELECT hollowgate_vtt.delete_owned_chapter_document(v_owner,v_other_campaign,v_chapter) INTO v_result;
 IF v_result IS NOT NULL THEN RAISE EXCEPTION 'Foreign campaign chapter deletion accepted'; END IF;
 IF (SELECT count(*) FROM hollowgate_vtt.list_owned_chapter_documents(v_other,v_other_campaign))<>1
 THEN RAISE EXCEPTION 'Foreign deletion affected second campaign'; END IF;
 SELECT hollowgate_vtt.delete_owned_chapter_document(v_other,v_campaign,v_chapter) INTO v_result;
 IF v_result IS NOT NULL THEN RAISE EXCEPTION 'Foreign owner deleted chapter'; END IF;
 SELECT hollowgate_vtt.delete_owned_chapter_document(v_owner,v_campaign,v_chapter) INTO v_result;
 IF v_result IS DISTINCT FROM v_chapter THEN RAISE EXCEPTION 'Owner delete failed'; END IF;
 IF EXISTS(SELECT 1 FROM hollowgate_vtt.list_owned_chapter_documents(v_owner,v_campaign))
 THEN RAISE EXCEPTION 'Chapter remained after deletion'; END IF;
 IF has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.chapter_documents','SELECT')
 OR has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.chapter_documents','INSERT')
 OR has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.chapter_documents','UPDATE')
 OR has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.chapter_documents','DELETE')
 THEN RAISE EXCEPTION 'Runtime has direct chapter table privileges'; END IF;
END $$;
ROLLBACK;
