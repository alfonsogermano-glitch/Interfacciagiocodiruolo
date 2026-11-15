-- 031: isolated PostgreSQL portrait storage, staging only.
-- Small binary portrait payloads; neither browser nor runtime can read base tables.
-- No Supabase storage, arbitrary object keys or public URLs.
BEGIN;
CREATE TABLE hollowgate_vtt.character_portraits (
 character_id uuid PRIMARY KEY REFERENCES hollowgate_vtt.character_drafts(id) ON DELETE RESTRICT,
 mime_type text NOT NULL CHECK (mime_type IN ('image/png','image/jpeg','image/webp')),
 bytes bytea NOT NULL CHECK (octet_length(bytes) BETWEEN 12 AND 524288),
 updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON hollowgate_vtt.character_portraits FROM PUBLIC,hollowgate_api_runtime;

CREATE FUNCTION hollowgate_vtt.save_owned_character_portrait(
 p_owner uuid,p_campaign uuid,p_character uuid,p_type text,p_bytes bytea)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF p_type NOT IN ('image/png','image/jpeg','image/webp')
  OR p_bytes IS NULL OR octet_length(p_bytes) NOT BETWEEN 12 AND 524288
  THEN RETURN false; END IF;
 IF NOT EXISTS (
  SELECT 1 FROM hollowgate_vtt.character_drafts d
  JOIN hollowgate_vtt.campaigns c ON c.id=d.campaign_id AND c.owner_id=p_owner
  JOIN hollowgate_auth.users u ON u.id=p_owner
   AND u.status='active' AND u.email_verified_at IS NOT NULL
  WHERE d.id=p_character AND d.campaign_id=p_campaign AND d.owner_id=p_owner
   AND d.status IN ('draft','active')
 ) THEN RETURN false; END IF;
 INSERT INTO hollowgate_vtt.character_portraits(character_id,mime_type,bytes)
 VALUES(p_character,p_type,p_bytes)
 ON CONFLICT (character_id) DO UPDATE
  SET mime_type=EXCLUDED.mime_type,bytes=EXCLUDED.bytes,updated_at=now();
 RETURN true;
END $$;

CREATE FUNCTION hollowgate_vtt.read_authorized_character_portrait(
 p_user uuid,p_campaign uuid,p_character uuid)
RETURNS TABLE(mime_type text,bytes bytea)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT p.mime_type,p.bytes FROM hollowgate_vtt.character_portraits p
 JOIN hollowgate_vtt.character_drafts d ON d.id=p.character_id
 JOIN hollowgate_vtt.campaigns c ON c.id=d.campaign_id AND c.owner_id=d.owner_id
 JOIN hollowgate_auth.users gm ON gm.id=c.owner_id
  AND gm.status='active' AND gm.email_verified_at IS NOT NULL
 WHERE d.id=p_character AND d.campaign_id=p_campaign
  AND (
   (d.owner_id=p_user AND d.status IN ('draft','active'))
   OR
   (d.status='active' AND d.available_for_players=true AND
    EXISTS(
     SELECT 1 FROM hollowgate_vtt.character_player_assignments a
     JOIN hollowgate_vtt.campaign_members m
      ON m.campaign_id=a.campaign_id AND m.user_id=a.player_id
      AND m.status='active' AND m.member_role='player'
     JOIN hollowgate_auth.users pu ON pu.id=m.user_id
      AND pu.status='active' AND pu.email_verified_at IS NOT NULL
     WHERE a.character_id=d.id AND a.campaign_id=d.campaign_id
      AND a.player_id=p_user
    ))
  )
 LIMIT 1
$$;
REVOKE ALL ON FUNCTION hollowgate_vtt.save_owned_character_portrait(uuid,uuid,uuid,text,bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.read_authorized_character_portrait(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.save_owned_character_portrait(uuid,uuid,uuid,text,bytea)
 TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.read_authorized_character_portrait(uuid,uuid,uuid)
 TO hollowgate_api_runtime;
COMMIT;
