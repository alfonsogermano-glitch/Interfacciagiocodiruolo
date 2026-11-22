-- 034: player claim/release for GM-owned available characters.
-- Physical owner_id remains the campaign GM so rollback is lossless. The claim
-- row is the authoritative logical ownership transfer and is never browser-set.
BEGIN;
CREATE TABLE hollowgate_vtt.character_claims (
 character_id uuid PRIMARY KEY REFERENCES hollowgate_vtt.character_drafts(id) ON DELETE RESTRICT,
 campaign_id uuid NOT NULL REFERENCES hollowgate_vtt.campaigns(id) ON DELETE RESTRICT,
 original_owner_id uuid NOT NULL REFERENCES hollowgate_auth.users(id) ON DELETE RESTRICT,
 player_id uuid NOT NULL REFERENCES hollowgate_auth.users(id) ON DELETE RESTRICT,
 claimed_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(campaign_id,player_id)
);
CREATE INDEX character_claims_player_idx
 ON hollowgate_vtt.character_claims(player_id,campaign_id);
REVOKE ALL ON hollowgate_vtt.character_claims FROM PUBLIC,hollowgate_api_runtime;

CREATE FUNCTION hollowgate_vtt.claim_available_character(p_player uuid,p_character uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_campaign uuid;v_owner uuid;
BEGIN
 SELECT d.campaign_id,c.owner_id INTO v_campaign,v_owner
 FROM hollowgate_vtt.character_drafts d
 JOIN hollowgate_vtt.campaigns c ON c.id=d.campaign_id AND c.owner_id=d.owner_id
 JOIN hollowgate_auth.users owner_u ON owner_u.id=c.owner_id
  AND owner_u.status='active' AND owner_u.email_verified_at IS NOT NULL
 WHERE d.id=p_character AND d.status='active' AND d.available_for_players=true
  AND NOT EXISTS(SELECT 1 FROM hollowgate_vtt.character_player_assignments a WHERE a.character_id=d.id)
 FOR UPDATE OF d;
 IF v_campaign IS NULL THEN RETURN NULL;END IF;
 IF NOT EXISTS(
  SELECT 1 FROM hollowgate_vtt.campaign_members m
  JOIN hollowgate_auth.users player_u ON player_u.id=m.user_id
   AND player_u.status='active' AND player_u.email_verified_at IS NOT NULL
  WHERE m.campaign_id=v_campaign AND m.user_id=p_player
   AND m.status='active' AND m.member_role='player'
  FOR SHARE OF m
 ) THEN RETURN NULL;END IF;
 INSERT INTO hollowgate_vtt.character_claims(character_id,campaign_id,original_owner_id,player_id)
 VALUES(p_character,v_campaign,v_owner,p_player);
 INSERT INTO hollowgate_vtt.character_player_assignments(character_id,campaign_id,player_id)
 VALUES(p_character,v_campaign,p_player);
 RETURN v_campaign;
EXCEPTION WHEN unique_violation THEN
 RETURN NULL;
END $$;

CREATE FUNCTION hollowgate_vtt.list_claimable_characters(p_player uuid,p_campaign uuid)
RETURNS TABLE(id uuid,campaign_id uuid,owner_id uuid,name text,sheet_data jsonb,
 status text,created_at timestamptz,updated_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT d.id,d.campaign_id,d.owner_id,d.name,d.sheet_data,d.status,d.created_at,d.updated_at
 FROM hollowgate_vtt.character_drafts d
 JOIN hollowgate_vtt.campaigns c ON c.id=d.campaign_id AND c.owner_id=d.owner_id
 JOIN hollowgate_auth.users owner_u ON owner_u.id=c.owner_id
  AND owner_u.status='active' AND owner_u.email_verified_at IS NOT NULL
 JOIN hollowgate_vtt.campaign_members m ON m.campaign_id=d.campaign_id
  AND m.user_id=p_player AND m.status='active' AND m.member_role='player'
 JOIN hollowgate_auth.users player_u ON player_u.id=m.user_id
  AND player_u.status='active' AND player_u.email_verified_at IS NOT NULL
 WHERE d.campaign_id=p_campaign AND d.status='active' AND d.available_for_players=true
  AND NOT EXISTS(SELECT 1 FROM hollowgate_vtt.character_player_assignments a WHERE a.character_id=d.id)
  AND NOT EXISTS(SELECT 1 FROM hollowgate_vtt.character_claims cl WHERE cl.campaign_id=d.campaign_id AND cl.player_id=p_player)
 ORDER BY d.created_at,d.id LIMIT 100
$$;

CREATE FUNCTION hollowgate_vtt.release_claimed_character(p_player uuid,p_character uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_campaign uuid;
BEGIN
 SELECT c.campaign_id INTO v_campaign FROM hollowgate_vtt.character_claims c
 WHERE c.character_id=p_character AND c.player_id=p_player FOR UPDATE;
 IF v_campaign IS NULL THEN RETURN NULL;END IF;
 DELETE FROM hollowgate_vtt.character_player_assignments
  WHERE character_id=p_character AND campaign_id=v_campaign AND player_id=p_player;
 DELETE FROM hollowgate_vtt.character_claims
  WHERE character_id=p_character AND campaign_id=v_campaign AND player_id=p_player;
 RETURN v_campaign;
END $$;

CREATE FUNCTION hollowgate_vtt.get_player_character_claim(p_player uuid,p_campaign uuid)
RETURNS TABLE(character_id uuid,claimed_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT cl.character_id,cl.claimed_at FROM hollowgate_vtt.character_claims cl
 JOIN hollowgate_vtt.campaign_members m ON m.campaign_id=cl.campaign_id
  AND m.user_id=cl.player_id AND m.status='active' AND m.member_role='player'
 JOIN hollowgate_auth.users player_u ON player_u.id=m.user_id
  AND player_u.status='active' AND player_u.email_verified_at IS NOT NULL
 WHERE cl.player_id=p_player AND cl.campaign_id=p_campaign
 LIMIT 1
$$;

CREATE FUNCTION hollowgate_vtt.save_claimed_character_sheet(
 p_player uuid,p_campaign uuid,p_character uuid,p_name text,p_sheet jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
 IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 120
  OR p_sheet IS NULL OR jsonb_typeof(p_sheet)<>'object'
  OR octet_length(p_sheet::text)>32768
  OR NOT (p_sheet ? 'style' AND p_sheet ? 'viaggio' AND p_sheet ? 'ambiti'
   AND p_sheet ? 'abilita' AND p_sheet ? 'tratti' AND p_sheet ? 'equipment')
 THEN RAISE EXCEPTION 'Invalid character sheet' USING ERRCODE='22023';END IF;
 UPDATE hollowgate_vtt.character_drafts d
 SET name=btrim(p_name),sheet_data=p_sheet,updated_at=now()
 FROM hollowgate_vtt.character_claims cl,hollowgate_vtt.campaign_members m,
  hollowgate_auth.users player_u
 WHERE d.id=p_character AND d.campaign_id=p_campaign AND d.status='active'
  AND cl.character_id=d.id AND cl.campaign_id=d.campaign_id AND cl.player_id=p_player
  AND m.campaign_id=d.campaign_id AND m.user_id=p_player
  AND m.status='active' AND m.member_role='player'
  AND player_u.id=p_player AND player_u.status='active'
  AND player_u.email_verified_at IS NOT NULL
 RETURNING d.id INTO v_id;
 RETURN v_id;
END $$;

CREATE FUNCTION hollowgate_vtt.save_authorized_character_portrait(
 p_user uuid,p_campaign uuid,p_character uuid,p_type text,p_bytes bytea)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF p_type NOT IN ('image/png','image/jpeg','image/webp')
  OR p_bytes IS NULL OR octet_length(p_bytes) NOT BETWEEN 12 AND 524288
  THEN RETURN false;END IF;
 IF NOT EXISTS(
  SELECT 1 FROM hollowgate_vtt.character_drafts d
  JOIN hollowgate_vtt.campaigns c ON c.id=d.campaign_id AND c.owner_id=d.owner_id
  JOIN hollowgate_auth.users actor ON actor.id=p_user
   AND actor.status='active' AND actor.email_verified_at IS NOT NULL
  WHERE d.id=p_character AND d.campaign_id=p_campaign
   AND ((d.owner_id=p_user AND d.status IN ('draft','active')) OR
    (d.status='active' AND EXISTS(
     SELECT 1 FROM hollowgate_vtt.character_claims cl
     JOIN hollowgate_vtt.campaign_members m ON m.campaign_id=cl.campaign_id
      AND m.user_id=cl.player_id AND m.status='active' AND m.member_role='player'
     WHERE cl.character_id=d.id AND cl.campaign_id=d.campaign_id AND cl.player_id=p_user)))
 ) THEN RETURN false;END IF;
 INSERT INTO hollowgate_vtt.character_portraits(character_id,mime_type,bytes)
 VALUES(p_character,p_type,p_bytes)
 ON CONFLICT(character_id) DO UPDATE SET mime_type=EXCLUDED.mime_type,bytes=EXCLUDED.bytes,updated_at=now();
 RETURN true;
END $$;

CREATE FUNCTION hollowgate_vtt.list_owned_character_claims(p_owner uuid,p_campaign uuid)
RETURNS TABLE(character_id uuid,player_id uuid,claimed_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT cl.character_id,cl.player_id,cl.claimed_at
 FROM hollowgate_vtt.character_claims cl
 JOIN hollowgate_vtt.campaigns c ON c.id=cl.campaign_id AND c.owner_id=p_owner
 JOIN hollowgate_vtt.character_drafts d ON d.id=cl.character_id
  AND d.campaign_id=cl.campaign_id AND d.owner_id=p_owner AND d.status='active'
 JOIN hollowgate_vtt.campaign_members m ON m.campaign_id=cl.campaign_id
  AND m.user_id=cl.player_id AND m.status='active' AND m.member_role='player'
 WHERE cl.campaign_id=p_campaign AND cl.original_owner_id=p_owner
 ORDER BY cl.claimed_at,cl.character_id LIMIT 100
$$;

-- Extend the existing membership fail-closed trigger. Reactivation never
-- restores a prior claim or assignment.
CREATE OR REPLACE FUNCTION hollowgate_vtt.revoke_invalid_character_assignments()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF NEW.status<>'active' OR NEW.member_role<>'player' THEN
  DELETE FROM hollowgate_vtt.character_claims
   WHERE campaign_id=NEW.campaign_id AND player_id=NEW.user_id;
  DELETE FROM hollowgate_vtt.character_player_assignments
   WHERE campaign_id=NEW.campaign_id AND player_id=NEW.user_id;
 END IF;
 RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION
 hollowgate_vtt.claim_available_character(uuid,uuid),
 hollowgate_vtt.list_claimable_characters(uuid,uuid),
 hollowgate_vtt.get_player_character_claim(uuid,uuid),
 hollowgate_vtt.release_claimed_character(uuid,uuid),
 hollowgate_vtt.save_claimed_character_sheet(uuid,uuid,uuid,text,jsonb),
 hollowgate_vtt.save_authorized_character_portrait(uuid,uuid,uuid,text,bytea),
 hollowgate_vtt.list_owned_character_claims(uuid,uuid)
 FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
 hollowgate_vtt.claim_available_character(uuid,uuid),
 hollowgate_vtt.list_claimable_characters(uuid,uuid),
 hollowgate_vtt.get_player_character_claim(uuid,uuid),
 hollowgate_vtt.release_claimed_character(uuid,uuid),
 hollowgate_vtt.save_claimed_character_sheet(uuid,uuid,uuid,text,jsonb),
 hollowgate_vtt.save_authorized_character_portrait(uuid,uuid,uuid,text,bytea),
 hollowgate_vtt.list_owned_character_claims(uuid,uuid)
 TO hollowgate_api_runtime;
COMMIT;
