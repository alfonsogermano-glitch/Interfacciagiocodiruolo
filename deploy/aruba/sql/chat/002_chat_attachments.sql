BEGIN;
CREATE TABLE hollowgate_vtt.chat_attachments(
 id uuid PRIMARY KEY,
 campaign_id uuid NOT NULL REFERENCES hollowgate_vtt.campaigns(id) ON DELETE RESTRICT,
 uploader_id uuid NOT NULL REFERENCES hollowgate_auth.users(id) ON DELETE RESTRICT,
 recipient_id uuid REFERENCES hollowgate_auth.users(id) ON DELETE RESTRICT,
 file_name text NOT NULL CHECK(length(file_name) BETWEEN 1 AND 255),
 mime_type text NOT NULL CHECK(length(mime_type) BETWEEN 1 AND 200),
 bytes bytea NOT NULL CHECK(octet_length(bytes) BETWEEN 1 AND 52428800),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(recipient_id IS NULL OR recipient_id<>uploader_id)
);
CREATE INDEX chat_attachments_scope_idx ON hollowgate_vtt.chat_attachments(campaign_id,uploader_id,recipient_id,created_at);
REVOKE ALL ON hollowgate_vtt.chat_attachments FROM PUBLIC,hollowgate_api_runtime;

CREATE FUNCTION hollowgate_vtt.save_chat_attachment(p_user uuid,p_campaign uuid,p_id uuid,p_recipient uuid,p_name text,p_type text,p_bytes bytea)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF hollowgate_vtt.campaign_member_role(p_user,p_campaign) IS NULL OR (p_recipient IS NOT NULL AND (p_recipient=p_user OR hollowgate_vtt.campaign_member_role(p_recipient,p_campaign) IS NULL)) OR p_name IS NULL OR length(p_name) NOT BETWEEN 1 AND 255 OR p_type IS NULL OR length(p_type) NOT BETWEEN 1 AND 200 OR p_bytes IS NULL OR octet_length(p_bytes) NOT BETWEEN 1 AND 52428800 THEN RETURN false;END IF;
 INSERT INTO hollowgate_vtt.chat_attachments(id,campaign_id,uploader_id,recipient_id,file_name,mime_type,bytes) VALUES(p_id,p_campaign,p_user,p_recipient,p_name,p_type,p_bytes);RETURN true;
END $$;

CREATE FUNCTION hollowgate_vtt.read_chat_attachment(p_user uuid,p_campaign uuid,p_id uuid)
RETURNS TABLE(file_name text,mime_type text,bytes bytea)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT a.file_name,a.mime_type,a.bytes FROM hollowgate_vtt.chat_attachments a
 WHERE a.id=p_id AND a.campaign_id=p_campaign AND hollowgate_vtt.campaign_member_role(p_user,p_campaign) IS NOT NULL
  AND (a.recipient_id IS NULL OR p_user IN (a.uploader_id,a.recipient_id)) LIMIT 1
$$;

CREATE FUNCTION hollowgate_vtt.delete_chat_attachment(p_user uuid,p_campaign uuid,p_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_id uuid;BEGIN DELETE FROM hollowgate_vtt.chat_attachments WHERE id=p_id AND campaign_id=p_campaign AND uploader_id=p_user RETURNING id INTO v_id;RETURN v_id;END $$;

REVOKE ALL ON FUNCTION hollowgate_vtt.save_chat_attachment(uuid,uuid,uuid,uuid,text,text,bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.read_chat_attachment(uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.delete_chat_attachment(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.save_chat_attachment(uuid,uuid,uuid,uuid,text,text,bytea) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.read_chat_attachment(uuid,uuid,uuid) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.delete_chat_attachment(uuid,uuid,uuid) TO hollowgate_api_runtime;
COMMIT;
