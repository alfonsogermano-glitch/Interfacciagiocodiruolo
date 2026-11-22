-- Authenticated campaign chat foundation. No Supabase or browser identity is trusted.
BEGIN;
CREATE TABLE hollowgate_vtt.campaign_chat_messages(
 id uuid PRIMARY KEY,
 campaign_id uuid NOT NULL REFERENCES hollowgate_vtt.campaigns(id) ON DELETE RESTRICT,
 sender_id uuid NOT NULL REFERENCES hollowgate_auth.users(id) ON DELETE RESTRICT,
 kind text NOT NULL CHECK(kind IN ('message','roll','attachment')),
 content text NOT NULL CHECK(length(content)<=10000),
 payload jsonb,
 reactions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(reactions)='array'),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX campaign_chat_timeline_idx ON hollowgate_vtt.campaign_chat_messages(campaign_id,created_at,id);
REVOKE ALL ON hollowgate_vtt.campaign_chat_messages FROM PUBLIC,hollowgate_api_runtime;

CREATE TABLE hollowgate_vtt.private_chat_messages(
 id uuid PRIMARY KEY,
 campaign_id uuid NOT NULL REFERENCES hollowgate_vtt.campaigns(id) ON DELETE RESTRICT,
 sender_id uuid NOT NULL REFERENCES hollowgate_auth.users(id) ON DELETE RESTRICT,
 recipient_id uuid NOT NULL REFERENCES hollowgate_auth.users(id) ON DELETE RESTRICT,
 kind text NOT NULL CHECK(kind IN ('message','attachment')),
 content text NOT NULL CHECK(length(content)<=10000),
 payload jsonb,
 deleted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(sender_id<>recipient_id)
);
CREATE INDEX private_chat_inbox_idx ON hollowgate_vtt.private_chat_messages(campaign_id,sender_id,recipient_id,created_at,id);
REVOKE ALL ON hollowgate_vtt.private_chat_messages FROM PUBLIC,hollowgate_api_runtime;

CREATE FUNCTION hollowgate_vtt.list_campaign_chat(p_user uuid,p_campaign uuid)
RETURNS TABLE(id uuid,campaign_id uuid,kind text,sender_id uuid,sender_name text,content text,payload jsonb,reactions jsonb,created_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT m.id,m.campaign_id,m.kind,m.sender_id,u.display_name,m.content,m.payload,m.reactions,m.created_at
 FROM hollowgate_vtt.campaign_chat_messages m
 JOIN hollowgate_auth.users u ON u.id=m.sender_id
 WHERE m.campaign_id=p_campaign AND hollowgate_vtt.campaign_member_role(p_user,p_campaign) IS NOT NULL
 ORDER BY m.created_at,m.id LIMIT 1000
$$;

CREATE FUNCTION hollowgate_vtt.insert_campaign_chat(p_user uuid,p_campaign uuid,p_id uuid,p_kind text,p_content text,p_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
 IF hollowgate_vtt.campaign_member_role(p_user,p_campaign) IS NULL OR p_kind NOT IN ('message','roll','attachment') OR p_content IS NULL OR length(p_content)>10000 THEN RETURN NULL;END IF;
 INSERT INTO hollowgate_vtt.campaign_chat_messages(id,campaign_id,sender_id,kind,content,payload)
 VALUES(p_id,p_campaign,p_user,p_kind,p_content,p_payload)
 ON CONFLICT(id) DO NOTHING RETURNING id INTO v_id;
 IF v_id IS NULL AND EXISTS(SELECT 1 FROM hollowgate_vtt.campaign_chat_messages WHERE id=p_id AND campaign_id=p_campaign AND sender_id=p_user) THEN v_id:=p_id;END IF;
 RETURN v_id;
END $$;

CREATE FUNCTION hollowgate_vtt.delete_campaign_chat_message(p_user uuid,p_campaign uuid,p_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_id uuid;v_role text;
BEGIN
 v_role=hollowgate_vtt.campaign_member_role(p_user,p_campaign);
 IF v_role IS NULL THEN RETURN NULL;END IF;
 DELETE FROM hollowgate_vtt.campaign_chat_messages WHERE id=p_id AND campaign_id=p_campaign AND (sender_id=p_user OR v_role='gm') RETURNING id INTO v_id;
 RETURN v_id;
END $$;

CREATE FUNCTION hollowgate_vtt.clear_campaign_chat(p_user uuid,p_campaign uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_count integer;v_role text;
BEGIN
 v_role=hollowgate_vtt.campaign_member_role(p_user,p_campaign);
 IF v_role IS NULL THEN RETURN NULL;END IF;
 DELETE FROM hollowgate_vtt.campaign_chat_messages WHERE campaign_id=p_campaign AND (sender_id=p_user OR v_role='gm');
 GET DIAGNOSTICS v_count=ROW_COUNT;RETURN v_count;
END $$;

CREATE FUNCTION hollowgate_vtt.toggle_campaign_chat_reaction(p_user uuid,p_campaign uuid,p_message uuid,p_char text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_current jsonb;v_name text;v_same boolean;v_next jsonb;
BEGIN
 IF hollowgate_vtt.campaign_member_role(p_user,p_campaign) IS NULL OR p_char IS NULL OR length(p_char) NOT BETWEEN 1 AND 16 THEN RETURN NULL;END IF;
 SELECT m.reactions,u.display_name INTO v_current,v_name FROM hollowgate_vtt.campaign_chat_messages m
 JOIN hollowgate_auth.users u ON u.id=p_user WHERE m.id=p_message AND m.campaign_id=p_campaign FOR UPDATE OF m;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(v_current) r WHERE r->>'userId'=p_user::text AND r->>'char'=p_char) INTO v_same;
 SELECT COALESCE(jsonb_agg(r),'[]'::jsonb) INTO v_next FROM jsonb_array_elements(v_current) r WHERE r->>'userId'<>p_user::text;
 IF NOT v_same THEN v_next:=v_next||jsonb_build_array(jsonb_build_object('char',p_char,'userId',p_user,'userName',v_name,'createdAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));END IF;
 UPDATE hollowgate_vtt.campaign_chat_messages SET reactions=v_next WHERE id=p_message;
 RETURN v_next;
END $$;

CREATE FUNCTION hollowgate_vtt.list_campaign_chat_participants(p_user uuid,p_campaign uuid)
RETURNS TABLE(profile_id uuid,display_name text,is_gm boolean)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT u.id,u.display_name,hollowgate_vtt.campaign_member_role(u.id,p_campaign)='gm'
 FROM hollowgate_auth.users u
 WHERE hollowgate_vtt.campaign_member_role(p_user,p_campaign) IS NOT NULL
  AND hollowgate_vtt.campaign_member_role(u.id,p_campaign) IS NOT NULL
 ORDER BY u.display_name,u.id LIMIT 500
$$;

CREATE FUNCTION hollowgate_vtt.list_private_chat(p_user uuid,p_campaign uuid,p_peer uuid DEFAULT NULL)
RETURNS TABLE(id uuid,campaign_id uuid,kind text,sender_id uuid,sender_name text,recipient_id uuid,recipient_name text,content text,payload jsonb,deleted_at timestamptz,created_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT m.id,m.campaign_id,m.kind,m.sender_id,s.display_name,m.recipient_id,r.display_name,m.content,m.payload,m.deleted_at,m.created_at
 FROM hollowgate_vtt.private_chat_messages m JOIN hollowgate_auth.users s ON s.id=m.sender_id JOIN hollowgate_auth.users r ON r.id=m.recipient_id
 WHERE m.campaign_id=p_campaign AND hollowgate_vtt.campaign_member_role(p_user,p_campaign) IS NOT NULL
  AND (m.sender_id=p_user OR m.recipient_id=p_user)
  AND (p_peer IS NULL OR (m.sender_id=p_peer OR m.recipient_id=p_peer))
 ORDER BY m.created_at,m.id LIMIT 1000
$$;

CREATE FUNCTION hollowgate_vtt.insert_private_chat(p_user uuid,p_campaign uuid,p_id uuid,p_recipient uuid,p_kind text,p_content text,p_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
 IF p_user=p_recipient OR hollowgate_vtt.campaign_member_role(p_user,p_campaign) IS NULL OR hollowgate_vtt.campaign_member_role(p_recipient,p_campaign) IS NULL OR p_kind NOT IN ('message','attachment') OR p_content IS NULL OR length(p_content)>10000 THEN RETURN NULL;END IF;
 INSERT INTO hollowgate_vtt.private_chat_messages(id,campaign_id,sender_id,recipient_id,kind,content,payload)
 VALUES(p_id,p_campaign,p_user,p_recipient,p_kind,p_content,p_payload) RETURNING id INTO v_id;RETURN v_id;
END $$;

CREATE FUNCTION hollowgate_vtt.delete_private_chat_message(p_user uuid,p_campaign uuid,p_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_id uuid;BEGIN
 UPDATE hollowgate_vtt.private_chat_messages SET deleted_at=clock_timestamp() WHERE id=p_id AND campaign_id=p_campaign AND sender_id=p_user AND deleted_at IS NULL RETURNING id INTO v_id;RETURN v_id;
END $$;

CREATE FUNCTION hollowgate_vtt.clear_private_chat(p_user uuid,p_campaign uuid,p_peer uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_count integer;BEGIN
 IF p_user=p_peer OR hollowgate_vtt.campaign_member_role(p_user,p_campaign) IS NULL OR hollowgate_vtt.campaign_member_role(p_peer,p_campaign) IS NULL THEN RETURN NULL;END IF;
 DELETE FROM hollowgate_vtt.private_chat_messages WHERE campaign_id=p_campaign AND ((sender_id=p_user AND recipient_id=p_peer) OR (sender_id=p_peer AND recipient_id=p_user));GET DIAGNOSTICS v_count=ROW_COUNT;RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION hollowgate_vtt.list_campaign_chat(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.insert_campaign_chat(uuid,uuid,uuid,text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.delete_campaign_chat_message(uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.clear_campaign_chat(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.toggle_campaign_chat_reaction(uuid,uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.list_campaign_chat_participants(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.list_private_chat(uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.insert_private_chat(uuid,uuid,uuid,uuid,text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.delete_private_chat_message(uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.clear_private_chat(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.list_campaign_chat(uuid,uuid) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.insert_campaign_chat(uuid,uuid,uuid,text,text,jsonb) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.delete_campaign_chat_message(uuid,uuid,uuid) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.clear_campaign_chat(uuid,uuid) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.toggle_campaign_chat_reaction(uuid,uuid,uuid,text) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.list_campaign_chat_participants(uuid,uuid) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.list_private_chat(uuid,uuid,uuid) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.insert_private_chat(uuid,uuid,uuid,uuid,text,text,jsonb) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.delete_private_chat_message(uuid,uuid,uuid) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.clear_private_chat(uuid,uuid,uuid) TO hollowgate_api_runtime;
COMMIT;
