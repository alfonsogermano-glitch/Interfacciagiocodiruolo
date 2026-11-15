-- All test fixtures are transactional and rolled back; disposable PostgreSQL only.
BEGIN;
DO $$
DECLARE
 v_owner uuid:=gen_random_uuid();
 v_other uuid:=gen_random_uuid();
 v_campaign uuid;
 v_other_campaign uuid;
 v_chapter uuid:=gen_random_uuid();
 v_other_chapter uuid:=gen_random_uuid();
 v_scene uuid:=gen_random_uuid();
 v_payload jsonb;
 v_result uuid;
BEGIN
 INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source)
 VALUES(v_owner,'scene-owner-'||v_owner||'@example.org','Owner','active',now(),'local'),
 (v_other,'scene-other-'||v_other||'@example.org','Other','active',now(),'local');
 SELECT hollowgate_vtt.create_owned_campaign(v_owner,'Scenes','','hsc') INTO v_campaign;
 SELECT hollowgate_vtt.create_owned_campaign(v_other,'Other scenes','','hsc') INTO v_other_campaign;
 IF v_campaign IS NULL OR v_other_campaign IS NULL THEN RAISE EXCEPTION 'Campaign setup failed'; END IF;
 PERFORM hollowgate_vtt.save_owned_chapter_document(v_owner,v_campaign,v_chapter,
 jsonb_build_object('id',v_chapter::text,'campaignId',v_campaign::text,'title','Chapter'));
 PERFORM hollowgate_vtt.save_owned_chapter_document(v_other,v_other_campaign,v_other_chapter,
 jsonb_build_object('id',v_other_chapter::text,'campaignId',v_other_campaign::text,'title','Other chapter'));
 v_payload:=jsonb_build_object('id',v_scene::text,'campaignId',v_campaign::text,'chapterId',v_chapter::text,'title','Scene');
 SELECT hollowgate_vtt.save_owned_scene_document(v_other,v_campaign,v_scene,v_chapter,v_payload) INTO v_result;
 IF v_result IS NOT NULL THEN RAISE EXCEPTION 'Outsider wrote Scene'; END IF;
 SELECT hollowgate_vtt.save_owned_scene_document(v_owner,v_campaign,v_scene,v_other_chapter,
 jsonb_set(v_payload,'{chapterId}',to_jsonb(v_other_chapter::text))) INTO v_result;
 IF v_result IS NOT NULL THEN RAISE EXCEPTION 'Foreign chapter accepted'; END IF;
 SELECT hollowgate_vtt.save_owned_scene_document(v_owner,v_campaign,v_scene,v_chapter,v_payload) INTO v_result;
 IF v_result IS DISTINCT FROM v_scene THEN RAISE EXCEPTION 'Owner Scene write failed'; END IF;
 IF (SELECT count(*) FROM hollowgate_vtt.list_owned_scene_documents(v_owner,v_campaign))<>1
 OR (SELECT count(*) FROM hollowgate_vtt.list_owned_scene_documents(v_other,v_campaign))<>0
 THEN RAISE EXCEPTION 'Scene isolation failed'; END IF;
 SELECT hollowgate_vtt.save_owned_scene_document(v_owner,v_campaign,v_scene,v_chapter,
 jsonb_set(v_payload,'{campaignId}',to_jsonb(v_other_campaign::text))) INTO v_result;
 IF v_result IS NOT NULL THEN RAISE EXCEPTION 'Forged campaign accepted'; END IF;
 SELECT hollowgate_vtt.delete_owned_scene_document(v_other,v_campaign,v_scene) INTO v_result;
 IF v_result IS NOT NULL THEN RAISE EXCEPTION 'Outsider deleted Scene'; END IF;
 SELECT hollowgate_vtt.delete_owned_chapter_document(v_owner,v_campaign,v_chapter) INTO v_result;
 IF v_result IS DISTINCT FROM v_chapter OR
 (SELECT count(*) FROM hollowgate_vtt.list_owned_scene_documents(v_owner,v_campaign))<>0
 THEN RAISE EXCEPTION 'Chapter deletion did not cascade Scene'; END IF;
END $$;
ROLLBACK;
