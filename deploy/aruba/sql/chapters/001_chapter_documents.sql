-- Aruba chapters: privileged routines only; runtime has no direct table access.
BEGIN;
CREATE TABLE IF NOT EXISTS hollowgate_vtt.chapter_documents (
 id uuid NOT NULL,
 campaign_id uuid NOT NULL REFERENCES hollowgate_vtt.campaigns(id) ON DELETE CASCADE,
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 PRIMARY KEY(id,campaign_id)
);
CREATE INDEX IF NOT EXISTS chapter_documents_campaign_idx ON hollowgate_vtt.chapter_documents(campaign_id);
REVOKE ALL ON hollowgate_vtt.chapter_documents FROM PUBLIC,hollowgate_api_runtime;
CREATE OR REPLACE FUNCTION hollowgate_vtt.chapter_owner_authorized(p_owner uuid,p_campaign uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM hollowgate_vtt.campaigns c
 JOIN hollowgate_auth.users u ON u.id=c.owner_id
 WHERE c.id=p_campaign AND c.owner_id=p_owner AND u.status='active' AND u.email_verified_at IS NOT NULL)
$$;
CREATE OR REPLACE FUNCTION hollowgate_vtt.list_owned_chapter_documents(p_owner uuid,p_campaign uuid)
RETURNS TABLE(id uuid,campaign_id uuid,payload jsonb)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT d.id,d.campaign_id,d.payload FROM hollowgate_vtt.chapter_documents d
 WHERE d.campaign_id=p_campaign AND hollowgate_vtt.chapter_owner_authorized(p_owner,p_campaign)
 ORDER BY d.id LIMIT 1000
$$;
CREATE OR REPLACE FUNCTION hollowgate_vtt.list_owned_chapter_links(p_owner uuid,p_campaign uuid,p_ids uuid[])
RETURNS TABLE(id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT d.id FROM hollowgate_vtt.chapter_documents d
 WHERE d.campaign_id=p_campaign AND d.id=ANY(p_ids)
 AND hollowgate_vtt.chapter_owner_authorized(p_owner,p_campaign)
$$;
CREATE OR REPLACE FUNCTION hollowgate_vtt.save_owned_chapter_document(p_owner uuid,p_campaign uuid,p_id uuid,p_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF NOT hollowgate_vtt.chapter_owner_authorized(p_owner,p_campaign)
 OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object'
 OR p_payload->>'id' IS DISTINCT FROM p_id::text
 OR p_payload->>'campaignId' IS DISTINCT FROM p_campaign::text
 THEN RETURN NULL; END IF;
 INSERT INTO hollowgate_vtt.chapter_documents(id,campaign_id,payload)
 VALUES(p_id,p_campaign,p_payload)
 ON CONFLICT(id,campaign_id) DO UPDATE SET payload=EXCLUDED.payload;
 RETURN p_id;
END $$;
CREATE OR REPLACE FUNCTION hollowgate_vtt.delete_owned_chapter_document(p_owner uuid,p_campaign uuid,p_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
 IF NOT hollowgate_vtt.chapter_owner_authorized(p_owner,p_campaign) THEN RETURN NULL; END IF;
 DELETE FROM hollowgate_vtt.chapter_documents WHERE id=p_id AND campaign_id=p_campaign RETURNING id INTO v_id;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION hollowgate_vtt.chapter_owner_authorized(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.list_owned_chapter_documents(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.list_owned_chapter_links(uuid,uuid,uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.save_owned_chapter_document(uuid,uuid,uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.delete_owned_chapter_document(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.chapter_owner_authorized(uuid,uuid) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.list_owned_chapter_documents(uuid,uuid) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.list_owned_chapter_links(uuid,uuid,uuid[]) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.save_owned_chapter_document(uuid,uuid,uuid,jsonb) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.delete_owned_chapter_document(uuid,uuid,uuid) TO hollowgate_api_runtime;
COMMIT;
