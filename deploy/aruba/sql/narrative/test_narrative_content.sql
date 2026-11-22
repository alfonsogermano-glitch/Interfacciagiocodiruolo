BEGIN;
DO $$
<<narrative_test>>
DECLARE owner_id uuid:=gen_random_uuid(); other_id uuid:=gen_random_uuid(); campaign_id uuid; other_campaign uuid;
 item_id uuid:=gen_random_uuid();chapter_id uuid:=gen_random_uuid();scene_id uuid:=gen_random_uuid();asset_id uuid:=gen_random_uuid();result_id uuid;payload jsonb;
BEGIN
 INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source) VALUES
 (owner_id,'narrative-owner-'||owner_id||'@example.org','Owner','active',now(),'local'),
 (other_id,'narrative-other-'||other_id||'@example.org','Other','active',now(),'local');
 SELECT hollowgate_vtt.create_owned_campaign(owner_id,'Narrative test','','hsc') INTO campaign_id;
 SELECT hollowgate_vtt.create_owned_campaign(other_id,'Other narrative test','','hsc') INTO other_campaign;
 PERFORM hollowgate_vtt.save_owned_chapter_document(owner_id,campaign_id,chapter_id,
  jsonb_build_object('id',chapter_id::text,'campaignId',campaign_id::text,'title','Chapter','description','','order',0,'nextChapterIds',jsonb_build_array()));
 PERFORM hollowgate_vtt.save_owned_scene_document(owner_id,campaign_id,scene_id,chapter_id,
  jsonb_build_object('id',scene_id::text,'campaignId',campaign_id::text,'chapterId',chapter_id::text,'title','Scene','description','','order',0));
 PERFORM hollowgate_vtt.save_owned_visual_asset(owner_id,campaign_id,asset_id,'Narrative portrait','other','image/png',decode('89504e47','hex'),'image/png',decode('89504e47','hex'));
 payload:=jsonb_build_object('id',item_id::text,'campaignId',campaign_id::text,'title','Sigillo','chapterId',NULL,'sceneId',NULL);
 SELECT hollowgate_vtt.save_owned_narrative_content(other_id,campaign_id,'clues',item_id,payload) INTO result_id;
 IF result_id IS NOT NULL THEN RAISE EXCEPTION 'Foreign owner wrote narrative content'; END IF;
 SELECT hollowgate_vtt.save_owned_narrative_content(owner_id,campaign_id,'forged',item_id,payload) INTO result_id;
 IF result_id IS NOT NULL THEN RAISE EXCEPTION 'Unknown narrative kind accepted'; END IF;
 SELECT hollowgate_vtt.save_owned_narrative_content(owner_id,campaign_id,'clues',item_id,payload) INTO result_id;
 IF result_id IS DISTINCT FROM item_id THEN RAISE EXCEPTION 'Owner narrative write failed'; END IF;
 IF (SELECT count(*) FROM hollowgate_vtt.list_owned_narrative_content(owner_id,campaign_id,'clues'))<>1
 OR (SELECT count(*) FROM hollowgate_vtt.list_owned_narrative_content(other_id,campaign_id,'clues'))<>0
 OR (SELECT count(*) FROM hollowgate_vtt.list_owned_narrative_content(owner_id,campaign_id,'events'))<>0
 THEN RAISE EXCEPTION 'Narrative kind or owner isolation failed'; END IF;
 SELECT hollowgate_vtt.save_owned_narrative_content(owner_id,campaign_id,'clues',item_id,jsonb_set(payload,'{id}',to_jsonb(gen_random_uuid()::text))) INTO result_id;
 IF result_id IS NOT NULL THEN RAISE EXCEPTION 'Forged narrative ID accepted'; END IF;
 payload:=jsonb_build_object('id',item_id::text,'campaignId',campaign_id::text,'name','Mara','chapterId',chapter_id::text,'sceneId',scene_id::text,
  'portraitAssetId',asset_id::text,'portraitImageUrl',format('/vtt/campaigns/%s/visual-assets/%s/content',campaign_id,asset_id));
 SELECT hollowgate_vtt.save_owned_narrative_content(owner_id,campaign_id,'npcs',item_id,payload) INTO result_id;
 IF result_id IS DISTINCT FROM item_id THEN RAISE EXCEPTION 'Valid Chapter/Scene placement rejected';END IF;
 BEGIN
  DELETE FROM hollowgate_vtt.scene_documents s WHERE s.id=narrative_test.scene_id AND s.campaign_id=narrative_test.campaign_id;
  RAISE EXCEPTION 'Referenced Scene deletion accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL;END;
 BEGIN
  DELETE FROM hollowgate_vtt.visual_assets a WHERE a.id=narrative_test.asset_id AND a.campaign_id=narrative_test.campaign_id;
  RAISE EXCEPTION 'Referenced visual asset deletion accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL;END;
 BEGIN
  DELETE FROM hollowgate_vtt.chapter_documents c WHERE c.id=narrative_test.chapter_id AND c.campaign_id=narrative_test.campaign_id;
  RAISE EXCEPTION 'Referenced Chapter deletion accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL;END;
 SELECT hollowgate_vtt.save_owned_narrative_content(owner_id,campaign_id,'npcs',item_id,
  jsonb_set(payload,'{sceneId}',to_jsonb(gen_random_uuid()::text))) INTO result_id;
 IF result_id IS NOT NULL THEN RAISE EXCEPTION 'Missing Scene placement accepted';END IF;
 SELECT hollowgate_vtt.save_owned_narrative_content(owner_id,campaign_id,'npcs',item_id,
  jsonb_set(payload,'{chapterId}',to_jsonb(gen_random_uuid()::text))) INTO result_id;
 IF result_id IS NOT NULL THEN RAISE EXCEPTION 'Cross-Chapter Scene placement accepted';END IF;
 SELECT hollowgate_vtt.save_owned_narrative_content(owner_id,campaign_id,'npcs',item_id,
  jsonb_set(payload,'{environmentId}',to_jsonb(gen_random_uuid()::text))) INTO result_id;
 IF result_id IS NOT NULL THEN RAISE EXCEPTION 'Unsupported Environment placement accepted';END IF;
 SELECT hollowgate_vtt.save_owned_narrative_content(owner_id,campaign_id,'npcs',item_id,
  jsonb_set(payload,'{portraitAssetId}',to_jsonb(gen_random_uuid()::text))) INTO result_id;
 IF result_id IS NOT NULL THEN RAISE EXCEPTION 'Missing narrative visual asset accepted';END IF;
 SELECT hollowgate_vtt.delete_owned_narrative_content(other_id,campaign_id,'clues',item_id) INTO result_id;
 IF result_id IS NOT NULL THEN RAISE EXCEPTION 'Foreign narrative deletion accepted'; END IF;
 SELECT hollowgate_vtt.delete_owned_narrative_content(owner_id,campaign_id,'clues',item_id) INTO result_id;
 IF result_id IS DISTINCT FROM item_id THEN RAISE EXCEPTION 'Owner narrative deletion failed'; END IF;
 IF has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.narrative_content_documents','SELECT')
 OR has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.narrative_content_documents','INSERT')
 THEN RAISE EXCEPTION 'Runtime has direct narrative table privileges'; END IF;
END $$;
ROLLBACK;
