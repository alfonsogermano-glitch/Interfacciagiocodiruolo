-- 015: Campaign Notes are not entity/character custom tabs.
-- Owner-only foundation in disposable CI database; no HTTP/UI activation.
BEGIN;
CREATE TABLE hollowgate_vtt.campaign_notes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 campaign_id uuid NOT NULL REFERENCES hollowgate_vtt.campaigns(id) ON DELETE RESTRICT,
 creator_id uuid NOT NULL REFERENCES hollowgate_auth.users(id) ON DELETE RESTRICT,
 parent_note_id uuid REFERENCES hollowgate_vtt.campaign_notes(id) ON DELETE RESTRICT,
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 120),
 content_rich jsonb CHECK(content_rich IS NULL OR
  (jsonb_typeof(content_rich)='object' AND octet_length(content_rich::text)<=49152)),
 position integer NOT NULL DEFAULT 0 CHECK(position BETWEEN 0 AND 10000),
 visibility text NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','all')),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT no_self_parent CHECK(parent_note_id IS DISTINCT FROM id)
);
CREATE INDEX campaign_notes_campaign_parent_idx
 ON hollowgate_vtt.campaign_notes(campaign_id,parent_note_id,status,position);
REVOKE ALL ON hollowgate_vtt.campaign_notes FROM PUBLIC,hollowgate_api_runtime;
CREATE FUNCTION hollowgate_vtt.list_owned_campaign_notes(p_owner uuid,p_campaign uuid,p_parent uuid DEFAULT NULL)
RETURNS TABLE(id uuid,title text,content_rich jsonb,parent_note_id uuid,
 tab_position integer,visibility text)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT n.id,n.title,n.content_rich,n.parent_note_id,n.position,n.visibility
 FROM hollowgate_vtt.campaign_notes n
 JOIN hollowgate_vtt.campaigns c ON c.id=n.campaign_id AND c.owner_id=p_owner
 JOIN hollowgate_auth.users u ON u.id=p_owner
 LEFT JOIN hollowgate_vtt.campaign_notes parent ON parent.id=p_parent
 WHERE n.campaign_id=p_campaign AND n.status='active'
 AND n.parent_note_id IS NOT DISTINCT FROM p_parent
 AND u.status='active' AND u.email_verified_at IS NOT NULL
 AND (p_parent IS NULL OR (parent.campaign_id=p_campaign
  AND parent.parent_note_id IS NULL AND parent.status='active'))
 ORDER BY n.position,n.created_at,n.id LIMIT 100
$$;
CREATE FUNCTION hollowgate_vtt.create_owned_campaign_note(
 p_owner uuid,p_campaign uuid,p_title text,p_parent uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_id uuid;v_position integer;
BEGIN
 IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 120 THEN
  RAISE EXCEPTION 'Invalid note title' USING ERRCODE='22023';END IF;
 IF NOT EXISTS(SELECT 1 FROM hollowgate_vtt.campaigns c
 JOIN hollowgate_auth.users u ON u.id=c.owner_id
 WHERE c.id=p_campaign AND c.owner_id=p_owner AND u.status='active'
 AND u.email_verified_at IS NOT NULL) THEN RETURN NULL;END IF;
 IF p_parent IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hollowgate_vtt.campaign_notes n
 WHERE n.id=p_parent AND n.campaign_id=p_campaign AND n.status='active'
 AND n.parent_note_id IS NULL) THEN RETURN NULL;END IF;
 SELECT count(*) INTO v_position FROM hollowgate_vtt.campaign_notes n
 WHERE n.campaign_id=p_campaign AND n.status='active'
 AND n.parent_note_id IS NOT DISTINCT FROM p_parent;
 IF v_position>=100 THEN RAISE EXCEPTION 'Too many campaign notes' USING ERRCODE='22023';END IF;
 INSERT INTO hollowgate_vtt.campaign_notes(campaign_id,creator_id,parent_note_id,title,position)
 VALUES(p_campaign,p_owner,p_parent,btrim(p_title),v_position) RETURNING id INTO v_id;
 RETURN v_id;
END $$;
CREATE FUNCTION hollowgate_vtt.save_owned_campaign_note(
 p_owner uuid,p_campaign uuid,p_note uuid,p_title text,p_rich jsonb,p_position integer,p_visibility text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
 IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 120
 OR (p_rich IS NOT NULL AND (jsonb_typeof(p_rich)<>'object' OR octet_length(p_rich::text)>49152))
 OR p_position IS NULL OR p_position NOT BETWEEN 0 AND 10000
 OR p_visibility IS NULL OR p_visibility NOT IN ('private','all') THEN
  RAISE EXCEPTION 'Invalid campaign note' USING ERRCODE='22023';END IF;
 UPDATE hollowgate_vtt.campaign_notes n
 SET title=btrim(p_title),content_rich=p_rich,position=p_position,
 visibility=p_visibility,updated_at=now()
 FROM hollowgate_vtt.campaigns c,hollowgate_auth.users u
 WHERE n.id=p_note AND n.campaign_id=p_campaign AND n.status='active'
 AND c.id=p_campaign AND c.owner_id=p_owner AND u.id=p_owner AND u.status='active'
 AND u.email_verified_at IS NOT NULL
 AND (n.parent_note_id IS NULL OR EXISTS(
  SELECT 1 FROM hollowgate_vtt.campaign_notes parent WHERE parent.id=n.parent_note_id
  AND parent.campaign_id=p_campaign AND parent.status='active' AND parent.parent_note_id IS NULL))
 RETURNING n.id INTO v_id;
 RETURN v_id;
END $$;
CREATE FUNCTION hollowgate_vtt.archive_owned_campaign_note(
 p_owner uuid,p_campaign uuid,p_note uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
 -- Lock/authorize the target first; never archive children by a forged parent ID.
 SELECT n.id INTO v_id FROM hollowgate_vtt.campaign_notes n
 JOIN hollowgate_vtt.campaigns c ON c.id=n.campaign_id
 JOIN hollowgate_auth.users u ON u.id=c.owner_id
 WHERE n.id=p_note AND n.campaign_id=p_campaign AND n.status='active'
 AND c.owner_id=p_owner AND u.status='active' AND u.email_verified_at IS NOT NULL
 FOR UPDATE OF n;
 IF v_id IS NULL THEN RETURN NULL;END IF;
 UPDATE hollowgate_vtt.campaign_notes n SET status='archived',updated_at=now()
 WHERE n.campaign_id=p_campaign AND n.status='active'
 AND (n.id=p_note OR n.parent_note_id=p_note);
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION hollowgate_vtt.list_owned_campaign_notes(uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.create_owned_campaign_note(uuid,uuid,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.save_owned_campaign_note(uuid,uuid,uuid,text,jsonb,integer,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.archive_owned_campaign_note(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.list_owned_campaign_notes(uuid,uuid,uuid) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.create_owned_campaign_note(uuid,uuid,text,uuid) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.save_owned_campaign_note(uuid,uuid,uuid,text,jsonb,integer,text) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.archive_owned_campaign_note(uuid,uuid,uuid) TO hollowgate_api_runtime;
COMMIT;
