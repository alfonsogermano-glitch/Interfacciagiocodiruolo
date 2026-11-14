-- Original Hollowgate Scene documents, isolated by campaign and chapter.
-- Install only after deploy/aruba/sql/chapters/001_chapter_documents.sql.
BEGIN;
CREATE TABLE IF NOT EXISTS hollowgate_vtt.scene_documents (
 id uuid NOT NULL,
 campaign_id uuid NOT NULL REFERENCES hollowgate_vtt.campaigns(id) ON DELETE CASCADE,
 chapter_id uuid NOT NULL,
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 PRIMARY KEY(id,campaign_id),
 FOREIGN KEY(chapter_id,campaign_id) REFERENCES hollowgate_vtt.chapter_documents(id,campaign_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS scene_documents_chapter_idx ON hollowgate_vtt.scene_documents(campaign_id,chapter_id);
REVOKE ALL ON hollowgate_vtt.scene_documents FROM PUBLIC,hollowgate_api_runtime;
CREATE OR REPLACE FUNCTION hollowgate_vtt.list_owned_scene_documents(p_owner uuid,p_campaign uuid)
RETURNS TABLE(id uuid,campaign_id uuid,chapter_id uuid,payload jsonb)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT s.id,s.campaign_id,s.chapter_id,s.payload FROM hollowgate_vtt.scene_documents s
 WHERE s.campaign_id=p_campaign AND hollowgate_vtt.chapter_owner_authorized(p_owner,p_campaign)
 ORDER BY s.chapter_id,s.id LIMIT 2000
$$;
CREATE OR REPLACE FUNCTION hollowgate_vtt.save_owned_scene_document(p_owner uuid,p_campaign uuid,p_id uuid,p_chapter uuid,p_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF NOT hollowgate_vtt.chapter_owner_authorized(p_owner,p_campaign)
 OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object'
 OR p_payload->>'id' IS DISTINCT FROM p_id::text
 OR p_payload->>'campaignId' IS DISTINCT FROM p_campaign::text
 OR p_payload->>'chapterId' IS DISTINCT FROM p_chapter::text
 OR NOT EXISTS(SELECT 1 FROM hollowgate_vtt.chapter_documents c
  WHERE c.id=p_chapter AND c.campaign_id=p_campaign)
 THEN RETURN NULL; END IF;
 INSERT INTO hollowgate_vtt.scene_documents(id,campaign_id,chapter_id,payload)
 VALUES(p_id,p_campaign,p_chapter,p_payload)
 ON CONFLICT(id,campaign_id) DO UPDATE
 SET chapter_id=EXCLUDED.chapter_id,payload=EXCLUDED.payload;
 RETURN p_id;
END $$;
CREATE OR REPLACE FUNCTION hollowgate_vtt.delete_owned_scene_document(p_owner uuid,p_campaign uuid,p_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
 IF NOT hollowgate_vtt.chapter_owner_authorized(p_owner,p_campaign) THEN RETURN NULL; END IF;
 DELETE FROM hollowgate_vtt.scene_documents WHERE id=p_id AND campaign_id=p_campaign RETURNING id INTO v_id;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION hollowgate_vtt.list_owned_scene_documents(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.save_owned_scene_document(uuid,uuid,uuid,uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.delete_owned_scene_document(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.list_owned_scene_documents(uuid,uuid) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.save_owned_scene_document(uuid,uuid,uuid,uuid,jsonb) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.delete_owned_scene_document(uuid,uuid,uuid) TO hollowgate_api_runtime;
COMMIT;
