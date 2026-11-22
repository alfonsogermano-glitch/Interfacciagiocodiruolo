-- Aruba narrative content: original NPC/Monster/Clue/Situation payloads, owner-only routines.
BEGIN;
CREATE TABLE IF NOT EXISTS hollowgate_vtt.narrative_content_documents(
 id uuid NOT NULL,
 campaign_id uuid NOT NULL REFERENCES hollowgate_vtt.campaigns(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('npcs','monsters','clues','events')),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 PRIMARY KEY(id,campaign_id,kind)
);
CREATE INDEX IF NOT EXISTS narrative_content_campaign_kind_idx ON hollowgate_vtt.narrative_content_documents(campaign_id,kind);
REVOKE ALL ON hollowgate_vtt.narrative_content_documents FROM PUBLIC,hollowgate_api_runtime;
CREATE OR REPLACE FUNCTION hollowgate_vtt.protect_narrative_placement_references()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF TG_TABLE_NAME='scene_documents' THEN
  IF TG_OP='DELETE' AND EXISTS(SELECT 1 FROM hollowgate_vtt.narrative_content_documents n
   WHERE n.campaign_id=OLD.campaign_id AND n.payload->>'sceneId'=OLD.id::text)
  THEN RAISE EXCEPTION 'Scene is referenced by narrative content' USING ERRCODE='23503';END IF;
  IF TG_OP='UPDATE' AND NEW.chapter_id IS DISTINCT FROM OLD.chapter_id AND EXISTS(
   SELECT 1 FROM hollowgate_vtt.narrative_content_documents n WHERE n.campaign_id=OLD.campaign_id
    AND n.payload->>'sceneId'=OLD.id::text AND n.payload->>'chapterId' IS DISTINCT FROM NEW.chapter_id::text)
  THEN RAISE EXCEPTION 'Scene Chapter is referenced by narrative content' USING ERRCODE='23503';END IF;
 ELSIF TG_TABLE_NAME='chapter_documents' AND TG_OP='DELETE' AND EXISTS(
  SELECT 1 FROM hollowgate_vtt.narrative_content_documents n
   WHERE n.campaign_id=OLD.campaign_id AND n.payload->>'chapterId'=OLD.id::text)
 THEN RAISE EXCEPTION 'Chapter is referenced by narrative content' USING ERRCODE='23503';
 ELSIF TG_TABLE_NAME='visual_assets' AND TG_OP='DELETE' AND EXISTS(
  SELECT 1 FROM hollowgate_vtt.narrative_content_documents n WHERE n.campaign_id=OLD.campaign_id AND (
   n.payload->>'portraitAssetId'=OLD.id::text OR n.payload->>'portraitFrameAssetId'=OLD.id::text
   OR n.payload->>'coverFrameAssetId'=OLD.id::text
   OR n.payload->>'portraitImageUrl'=format('/vtt/campaigns/%s/visual-assets/%s/content',OLD.campaign_id,OLD.id)
   OR n.payload->>'portraitSourceImageUrl'=format('/vtt/campaigns/%s/visual-assets/%s/content',OLD.campaign_id,OLD.id)
   OR n.payload->>'coverImageUrl'=format('/vtt/campaigns/%s/visual-assets/%s/content',OLD.campaign_id,OLD.id)
   OR n.payload->>'imageUrl'=format('/vtt/campaigns/%s/visual-assets/%s/content',OLD.campaign_id,OLD.id)))
 THEN RAISE EXCEPTION 'Visual asset is referenced by narrative content' USING ERRCODE='23503';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_narrative_scene_references ON hollowgate_vtt.scene_documents;
CREATE TRIGGER protect_narrative_scene_references BEFORE DELETE OR UPDATE OF chapter_id ON hollowgate_vtt.scene_documents
 FOR EACH ROW EXECUTE FUNCTION hollowgate_vtt.protect_narrative_placement_references();
DROP TRIGGER IF EXISTS protect_narrative_chapter_references ON hollowgate_vtt.chapter_documents;
CREATE TRIGGER protect_narrative_chapter_references BEFORE DELETE ON hollowgate_vtt.chapter_documents
 FOR EACH ROW EXECUTE FUNCTION hollowgate_vtt.protect_narrative_placement_references();
DROP TRIGGER IF EXISTS protect_narrative_visual_asset_references ON hollowgate_vtt.visual_assets;
CREATE TRIGGER protect_narrative_visual_asset_references BEFORE DELETE ON hollowgate_vtt.visual_assets
 FOR EACH ROW EXECUTE FUNCTION hollowgate_vtt.protect_narrative_placement_references();
CREATE OR REPLACE FUNCTION hollowgate_vtt.narrative_content_owner_authorized(p_owner uuid,p_campaign uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM hollowgate_vtt.campaigns c JOIN hollowgate_auth.users u ON u.id=c.owner_id
 WHERE c.id=p_campaign AND c.owner_id=p_owner AND u.status='active' AND u.email_verified_at IS NOT NULL)
$$;
CREATE OR REPLACE FUNCTION hollowgate_vtt.list_owned_narrative_content(p_owner uuid,p_campaign uuid,p_kind text)
RETURNS TABLE(id uuid,kind text,campaign_id uuid,payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT d.id,d.kind,d.campaign_id,d.payload FROM hollowgate_vtt.narrative_content_documents d
 WHERE d.campaign_id=p_campaign AND d.kind=p_kind AND p_kind IN ('npcs','monsters','clues','events')
 AND hollowgate_vtt.narrative_content_owner_authorized(p_owner,p_campaign) ORDER BY d.id LIMIT 1000
$$;
CREATE OR REPLACE FUNCTION hollowgate_vtt.save_owned_narrative_content(p_owner uuid,p_campaign uuid,p_kind text,p_id uuid,p_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_chapter uuid;v_scene uuid;v_asset uuid;v_key text;v_value text;
BEGIN
 IF NOT hollowgate_vtt.narrative_content_owner_authorized(p_owner,p_campaign) OR p_kind NOT IN ('npcs','monsters','clues','events')
 OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR p_payload->>'id' IS DISTINCT FROM p_id::text
 OR p_payload->>'campaignId' IS DISTINCT FROM p_campaign::text THEN RETURN NULL; END IF;
 -- Aruba has authoritative placement tables only for Chapters and Scenes.
 -- Unsupported legacy placement IDs stay fail-closed instead of becoming
 -- unverified dangling references inside otherwise valid JSON.
 IF p_payload->>'environmentId' IS NOT NULL OR p_payload->>'mapLocationId' IS NOT NULL
  OR p_payload->>'folderId' IS NOT NULL THEN RETURN NULL;END IF;
 IF p_payload->>'chapterId' IS NOT NULL THEN
  BEGIN v_chapter:=(p_payload->>'chapterId')::uuid;EXCEPTION WHEN invalid_text_representation THEN RETURN NULL;END;
  IF NOT EXISTS(SELECT 1 FROM hollowgate_vtt.chapter_documents c WHERE c.id=v_chapter AND c.campaign_id=p_campaign)
  THEN RETURN NULL;END IF;
 END IF;
 IF p_payload->>'sceneId' IS NOT NULL THEN
  IF v_chapter IS NULL THEN RETURN NULL;END IF;
  BEGIN v_scene:=(p_payload->>'sceneId')::uuid;EXCEPTION WHEN invalid_text_representation THEN RETURN NULL;END;
  IF NOT EXISTS(SELECT 1 FROM hollowgate_vtt.scene_documents s
   WHERE s.id=v_scene AND s.campaign_id=p_campaign AND s.chapter_id=v_chapter)
  THEN RETURN NULL;END IF;
 END IF;
 FOREACH v_key IN ARRAY ARRAY['portraitImageUrl','portraitSourceImageUrl','coverImageUrl','imageUrl'] LOOP
  v_value:=p_payload->>v_key;
  IF v_value IS NOT NULL AND v_value<>'' THEN
   BEGIN v_asset:=split_part(v_value,'/',6)::uuid;EXCEPTION WHEN invalid_text_representation THEN RETURN NULL;END;
   IF v_value IS DISTINCT FROM format('/vtt/campaigns/%s/visual-assets/%s/content',p_campaign,v_asset)
    OR NOT EXISTS(SELECT 1 FROM hollowgate_vtt.visual_assets a WHERE a.id=v_asset AND a.campaign_id=p_campaign)
   THEN RETURN NULL;END IF;
  END IF;
 END LOOP;
 FOREACH v_key IN ARRAY ARRAY['portraitAssetId','portraitFrameAssetId','coverFrameAssetId'] LOOP
  v_value:=p_payload->>v_key;
  IF v_value IS NOT NULL AND v_value<>'' AND v_value<>'__none__' THEN
   BEGIN v_asset:=v_value::uuid;EXCEPTION WHEN invalid_text_representation THEN RETURN NULL;END;
   IF NOT EXISTS(SELECT 1 FROM hollowgate_vtt.visual_assets a WHERE a.id=v_asset AND a.campaign_id=p_campaign)
   THEN RETURN NULL;END IF;
  END IF;
 END LOOP;
 INSERT INTO hollowgate_vtt.narrative_content_documents(id,campaign_id,kind,payload) VALUES(p_id,p_campaign,p_kind,p_payload)
 ON CONFLICT(id,campaign_id,kind) DO UPDATE SET payload=EXCLUDED.payload;
 RETURN p_id;
END $$;
CREATE OR REPLACE FUNCTION hollowgate_vtt.delete_owned_narrative_content(p_owner uuid,p_campaign uuid,p_kind text,p_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_id uuid; BEGIN
 IF NOT hollowgate_vtt.narrative_content_owner_authorized(p_owner,p_campaign) OR p_kind NOT IN ('npcs','monsters','clues','events') THEN RETURN NULL; END IF;
 DELETE FROM hollowgate_vtt.narrative_content_documents WHERE id=p_id AND campaign_id=p_campaign AND kind=p_kind RETURNING id INTO v_id;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION hollowgate_vtt.narrative_content_owner_authorized(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.protect_narrative_placement_references() FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.list_owned_narrative_content(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.save_owned_narrative_content(uuid,uuid,text,uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.delete_owned_narrative_content(uuid,uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.narrative_content_owner_authorized(uuid,uuid) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.list_owned_narrative_content(uuid,uuid,text) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.save_owned_narrative_content(uuid,uuid,text,uuid,jsonb) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.delete_owned_narrative_content(uuid,uuid,text,uuid) TO hollowgate_api_runtime;
COMMIT;
