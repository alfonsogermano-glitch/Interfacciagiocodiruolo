-- 038: logical character ownership lifecycle + optional campaign attachment.
-- Unreleased, disposable QA only. No production/staging execution in this checkpoint.
-- Physical owner_id keeps remaining the campaign GM anchor (rollback lossless).
-- logical_owner_id is the authoritative logical owner (GM-created or claimed player);
-- original_owner_id is frozen at the first claim; claimable_origin is one-way.
-- character_drafts.campaign_id becomes nullable so a claimed character can be
-- detached and released without losing ownership, or moved across campaigns.
BEGIN;
ALTER TABLE hollowgate_vtt.character_drafts
 ADD COLUMN IF NOT EXISTS logical_owner_id uuid REFERENCES hollowgate_auth.users(id) ON DELETE RESTRICT,
 ADD COLUMN IF NOT EXISTS original_owner_id uuid REFERENCES hollowgate_auth.users(id) ON DELETE RESTRICT,
 ADD COLUMN IF NOT EXISTS claimable_origin boolean NOT NULL DEFAULT false;
ALTER TABLE hollowgate_vtt.character_drafts
 ADD COLUMN IF NOT EXISTS ruleset text CHECK (ruleset IN ('hsc','dnd5e','pathfinder','coc7e','cocclassic','custom'));
ALTER TABLE hollowgate_vtt.character_drafts ALTER COLUMN campaign_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS character_drafts_logical_owner_idx
  ON hollowgate_vtt.character_drafts(logical_owner_id,created_at DESC,id);

-- Backfill from current claim rows only: no historical ownership is guessed.
UPDATE hollowgate_vtt.character_drafts d
SET logical_owner_id=c.player_id,original_owner_id=COALESCE(d.original_owner_id,c.original_owner_id),claimable_origin=true,updated_at=now()
FROM hollowgate_vtt.character_claims c
WHERE c.character_id=d.id AND d.logical_owner_id IS NULL;
UPDATE hollowgate_vtt.character_drafts d SET claimable_origin=true
WHERE d.available_for_players;

-- Ruleset is restored only from the immutable original sheet source record.
UPDATE hollowgate_vtt.character_drafts d
SET ruleset=CASE d.sheet_data->'sourceRecord'->>'ruleset'
 WHEN 'hsc' THEN 'hsc'
 WHEN 'High School Cthulhu' THEN 'hsc'
 WHEN 'dnd5e' THEN 'dnd5e'
 WHEN 'D&D 5e' THEN 'dnd5e'
 WHEN 'pathfinder' THEN 'pathfinder'
 WHEN 'Pathfinder 2e' THEN 'pathfinder'
 WHEN 'coc7e' THEN 'coc7e'
 WHEN 'Il Richiamo di Cthulhu 7ª ed.' THEN 'coc7e'
 WHEN 'cocclassic' THEN 'cocclassic'
 WHEN 'Il Richiamo di Cthulhu Classic' THEN 'cocclassic'
 WHEN 'custom' THEN 'custom'
 WHEN 'Regolamento personalizzato' THEN 'custom'
 ELSE NULL END
WHERE d.ruleset IS NULL AND d.sheet_data ? 'sourceRecord'
 AND jsonb_typeof(d.sheet_data->'sourceRecord')='object';

CREATE OR REPLACE FUNCTION hollowgate_vtt.create_character_draft(
 p_owner uuid,p_campaign uuid,p_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
 IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 120 THEN
  RAISE EXCEPTION 'Invalid character name' USING ERRCODE='22023';
 END IF;
 IF p_campaign IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM hollowgate_vtt.campaigns c JOIN hollowgate_auth.users u ON u.id=c.owner_id
  WHERE c.id=p_campaign AND c.owner_id=p_owner AND u.status='active' AND u.email_verified_at IS NOT NULL
 ) THEN RETURN NULL; END IF;
 INSERT INTO hollowgate_vtt.character_drafts(campaign_id,owner_id,logical_owner_id,name)
 VALUES(p_campaign,p_owner,p_owner,btrim(p_name)) RETURNING id INTO v_id;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION hollowgate_vtt.create_character_draft(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.create_character_draft(uuid,uuid,text) TO hollowgate_api_runtime;

CREATE OR REPLACE FUNCTION hollowgate_vtt.save_owned_character_sheet(
 p_owner uuid,p_campaign uuid,p_character uuid,p_name text,p_sheet jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
 IF p_owner IS NULL OR p_campaign IS NULL OR p_character IS NULL OR p_name IS NULL
  OR length(btrim(p_name)) NOT BETWEEN 1 AND 120
  OR p_sheet IS NULL OR jsonb_typeof(p_sheet)<>'object'
  OR octet_length(p_sheet::text)>32768
  OR NOT (p_sheet ? 'style' AND p_sheet ? 'viaggio'
           AND p_sheet ? 'ambiti' AND p_sheet ? 'abilita'
           AND p_sheet ? 'tratti' AND p_sheet ? 'equipment') THEN
  RAISE EXCEPTION 'Invalid character sheet' USING ERRCODE='22023';
 END IF;
 UPDATE hollowgate_vtt.character_drafts d
 SET name=btrim(p_name),sheet_data=p_sheet,status='active',updated_at=now()
 FROM hollowgate_vtt.campaigns c,hollowgate_auth.users u
 WHERE d.id=p_character AND d.campaign_id=p_campaign AND d.owner_id=p_owner
  AND (d.logical_owner_id IS NULL OR d.logical_owner_id=p_owner)
  AND c.id=d.campaign_id AND c.owner_id=p_owner
  AND u.id=p_owner AND u.status='active' AND u.email_verified_at IS NOT NULL
 RETURNING d.id INTO v_id;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION hollowgate_vtt.save_owned_character_sheet(uuid,uuid,uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.save_owned_character_sheet(uuid,uuid,uuid,text,jsonb) TO hollowgate_api_runtime;

-- GM-owned pre-made availability; never marks a claimed character available.
CREATE OR REPLACE FUNCTION hollowgate_vtt.list_owned_character_availability(
 p_owner uuid,p_campaign uuid)
RETURNS TABLE(character_id uuid,available_for_players boolean)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT d.id,d.available_for_players FROM hollowgate_vtt.character_drafts d
 JOIN hollowgate_vtt.campaigns c ON c.id=d.campaign_id AND c.owner_id=p_owner
 JOIN hollowgate_auth.users u ON u.id=p_owner
 WHERE d.campaign_id=p_campaign AND d.owner_id=p_owner
  AND (d.logical_owner_id IS NULL OR d.logical_owner_id=p_owner)
  AND d.status='active'
 AND u.status='active' AND u.email_verified_at IS NOT NULL
 ORDER BY d.created_at,d.id LIMIT 100
$$;
CREATE OR REPLACE FUNCTION hollowgate_vtt.set_owned_character_availability(
 p_owner uuid,p_campaign uuid,p_character uuid,p_available boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 DECLARE v_count bigint:=0;
 BEGIN
  IF p_available IS NULL THEN
   RAISE EXCEPTION 'Availability required' USING ERRCODE='22023';
  END IF;
  UPDATE hollowgate_vtt.character_drafts d
  SET available_for_players=p_available,updated_at=now()
  FROM hollowgate_vtt.campaigns c,hollowgate_auth.users u
  WHERE d.id=p_character AND d.campaign_id=p_campaign AND d.owner_id=p_owner
   AND (d.logical_owner_id IS NULL OR d.logical_owner_id=p_owner)
   AND d.status='active'
   AND c.id=d.campaign_id AND c.owner_id=p_owner
   AND u.id=p_owner AND u.status='active' AND u.email_verified_at IS NOT NULL
   AND NOT EXISTS(SELECT 1 FROM hollowgate_vtt.character_claims cl
     WHERE cl.character_id=d.id AND cl.campaign_id=d.campaign_id);
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN v_count=1;
 END $$;
REVOKE ALL ON FUNCTION hollowgate_vtt.list_owned_character_availability(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.set_owned_character_availability(uuid,uuid,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.list_owned_character_availability(uuid,uuid) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.set_owned_character_availability(uuid,uuid,uuid,boolean) TO hollowgate_api_runtime;

-- GM-controlled assignment only for characters whose logical owner is still GM.
CREATE OR REPLACE FUNCTION hollowgate_vtt.set_owned_character_player_assignment(
 p_owner uuid,p_campaign uuid,p_character uuid,p_player uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_valid boolean;v_count bigint;
BEGIN
 SELECT true INTO v_valid FROM hollowgate_vtt.character_drafts d
 JOIN hollowgate_vtt.campaigns c ON c.id=d.campaign_id AND c.owner_id=p_owner
 JOIN hollowgate_auth.users u ON u.id=p_owner AND u.status='active'
  AND u.email_verified_at IS NOT NULL
 WHERE d.id=p_character AND d.campaign_id=p_campaign AND d.owner_id=p_owner
  AND (d.logical_owner_id IS NULL OR d.logical_owner_id=p_owner)
  AND d.status='active' FOR UPDATE OF d;
 IF v_valid IS DISTINCT FROM true THEN RETURN false;END IF;
 IF EXISTS(SELECT 1 FROM hollowgate_vtt.character_claims cl WHERE cl.character_id=p_character) THEN
  RETURN false;
 END IF;
 IF p_player IS NULL THEN
  DELETE FROM hollowgate_vtt.character_player_assignments
   WHERE character_id=p_character AND campaign_id=p_campaign;
  RETURN true;
 END IF;
 IF NOT EXISTS(
  SELECT 1 FROM hollowgate_vtt.campaign_members m
  JOIN hollowgate_auth.users u ON u.id=m.user_id
  WHERE m.campaign_id=p_campaign AND m.user_id=p_player
   AND m.status='active' AND m.member_role='player'
   AND u.status='active' AND u.email_verified_at IS NOT NULL
   FOR SHARE OF m
 ) THEN RETURN false;END IF;
 IF NOT EXISTS(
  SELECT 1 FROM hollowgate_vtt.character_drafts d
  WHERE d.id=p_character AND d.available_for_players=true
 ) THEN RETURN false;END IF;
 INSERT INTO hollowgate_vtt.character_player_assignments(character_id,campaign_id,player_id)
 VALUES(p_character,p_campaign,p_player)
 ON CONFLICT(character_id) DO UPDATE
  SET player_id=EXCLUDED.player_id,assigned_at=now()
  WHERE hollowgate_vtt.character_player_assignments.campaign_id=EXCLUDED.campaign_id;
 GET DIAGNOSTICS v_count=ROW_COUNT;
 RETURN v_count=1;
END $$;
CREATE OR REPLACE FUNCTION hollowgate_vtt.list_owned_character_player_assignments(
 p_owner uuid,p_campaign uuid)
RETURNS TABLE(character_id uuid,player_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT a.character_id,a.player_id FROM hollowgate_vtt.character_player_assignments a
 JOIN hollowgate_vtt.character_drafts d ON d.id=a.character_id
  AND d.campaign_id=a.campaign_id AND d.owner_id=p_owner
  AND (d.logical_owner_id IS NULL OR d.logical_owner_id=p_owner)
  AND d.status='active'
 JOIN hollowgate_vtt.campaigns c ON c.id=a.campaign_id AND c.owner_id=p_owner
 JOIN hollowgate_auth.users owner_u ON owner_u.id=p_owner AND owner_u.status='active'
  AND owner_u.email_verified_at IS NOT NULL
 JOIN hollowgate_vtt.campaign_members m ON m.campaign_id=a.campaign_id
  AND m.user_id=a.player_id AND m.member_role='player' AND m.status='active'
 JOIN hollowgate_auth.users player_u ON player_u.id=a.player_id
  AND player_u.status='active' AND player_u.email_verified_at IS NOT NULL
 WHERE a.campaign_id=p_campaign
 ORDER BY d.created_at,d.id LIMIT 100
$$;
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
REVOKE ALL ON FUNCTION hollowgate_vtt.set_owned_character_player_assignment(uuid,uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.list_owned_character_player_assignments(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.revoke_invalid_character_assignments() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.set_owned_character_player_assignment(uuid,uuid,uuid,uuid) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.list_owned_character_player_assignments(uuid,uuid) TO hollowgate_api_runtime;
COMMIT;

-- 034 replacement: logical ownership lifecycle, claim/release, detached release.
BEGIN;
CREATE OR REPLACE FUNCTION hollowgate_vtt.claim_available_character(p_player uuid,p_character uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_campaign uuid;v_owner uuid;v_logical uuid;v_original uuid;
BEGIN
 SELECT d.campaign_id,d.owner_id,d.logical_owner_id,d.original_owner_id
  INTO v_campaign,v_owner,v_logical,v_original
  FROM hollowgate_vtt.character_drafts d
  JOIN hollowgate_vtt.campaigns c ON c.id=d.campaign_id AND c.owner_id=d.owner_id
  JOIN hollowgate_auth.users owner_u ON owner_u.id=d.owner_id
   AND owner_u.status='active' AND owner_u.email_verified_at IS NOT NULL
  WHERE d.id=p_character AND d.status='active' AND d.available_for_players=true
   AND d.campaign_id IS NOT NULL
   AND (d.logical_owner_id IS NULL OR d.logical_owner_id=d.owner_id)
   AND NOT EXISTS(SELECT 1 FROM hollowgate_vtt.character_player_assignments a WHERE a.character_id=d.id)
   AND NOT EXISTS(SELECT 1 FROM hollowgate_vtt.character_claims cl
     WHERE cl.character_id=d.id AND cl.campaign_id=d.campaign_id)
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
 VALUES(p_character,v_campaign,COALESCE(v_original,v_owner),p_player);
 INSERT INTO hollowgate_vtt.character_player_assignments(character_id,campaign_id,player_id)
 VALUES(p_character,v_campaign,p_player);
 UPDATE hollowgate_vtt.character_drafts
 SET logical_owner_id=p_player,claimable_origin=true,
     original_owner_id=COALESCE(v_original,v_owner),updated_at=now()
 WHERE id=p_character;
 RETURN v_campaign;
EXCEPTION WHEN unique_violation THEN
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION hollowgate_vtt.list_claimable_characters(
 p_player uuid,p_campaign uuid)
RETURNS TABLE(id uuid,campaign_id uuid,owner_id uuid,name text,sheet_data jsonb,
 status text,created_at timestamptz,updated_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT d.id,d.campaign_id,d.owner_id,d.name,d.sheet_data,d.status,d.created_at,d.updated_at
 FROM hollowgate_vtt.character_drafts d
 JOIN hollowgate_vtt.campaigns c ON c.id=d.campaign_id AND c.owner_id=d.owner_id
 JOIN hollowgate_auth.users owner_u ON owner_u.id=d.owner_id
  AND owner_u.status='active' AND owner_u.email_verified_at IS NOT NULL
 JOIN hollowgate_vtt.campaign_members m ON m.campaign_id=d.campaign_id
  AND m.user_id=p_player AND m.status='active' AND m.member_role='player'
 JOIN hollowgate_auth.users player_u ON player_u.id=m.user_id
  AND player_u.status='active' AND player_u.email_verified_at IS NOT NULL
 WHERE d.campaign_id=p_campaign AND d.status='active' AND d.available_for_players=true
  AND (d.logical_owner_id IS NULL OR d.logical_owner_id=d.owner_id)
  AND NOT EXISTS(SELECT 1 FROM hollowgate_vtt.character_player_assignments a WHERE a.character_id=d.id)
  AND NOT EXISTS(SELECT 1 FROM hollowgate_vtt.character_claims cl
    WHERE cl.campaign_id=d.campaign_id AND cl.player_id=p_player)
 ORDER BY d.created_at,d.id LIMIT 100
$$;

CREATE OR REPLACE FUNCTION hollowgate_vtt.release_claimed_character(p_player uuid,p_character uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_id uuid;v_camp uuid;v_logical uuid;v_original uuid;
BEGIN
 SELECT d.id,d.campaign_id,d.logical_owner_id,d.original_owner_id
  INTO v_id,v_camp,v_logical,v_original
  FROM hollowgate_vtt.character_drafts d
  WHERE d.id=p_character
  FOR UPDATE OF d;
 IF NOT FOUND OR v_logical IS DISTINCT FROM p_player OR v_original IS NULL THEN
  RETURN NULL;
 END IF;
 UPDATE hollowgate_vtt.character_drafts
 SET logical_owner_id=v_original,available_for_players=true,updated_at=now()
 WHERE id=p_character;
 DELETE FROM hollowgate_vtt.character_player_assignments WHERE character_id=p_character;
 DELETE FROM hollowgate_vtt.character_claims WHERE character_id=p_character;
 RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION hollowgate_vtt.get_player_character_claim(
 p_player uuid,p_campaign uuid)
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

CREATE OR REPLACE FUNCTION hollowgate_vtt.save_claimed_character_sheet(
 p_player uuid,p_campaign uuid,p_character uuid,p_name text,p_sheet jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
 IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 120
  OR p_sheet IS NULL OR jsonb_typeof(p_sheet)<>'object'
  OR octet_length(p_sheet::text)>32768
  OR NOT (p_sheet ? 'style' AND p_sheet ? 'viaggio' AND p_sheet ? 'ambiti'
   AND p_sheet ? 'abilita' AND p_sheet ? 'tratti' AND p_sheet ? 'equipment')
 THEN RAISE EXCEPTION 'Invalid character sheet' USING ERRCODE='22023'; END IF;
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

CREATE OR REPLACE FUNCTION hollowgate_vtt.save_authorized_character_portrait(
 p_user uuid,p_campaign uuid,p_character uuid,p_type text,p_bytes bytea)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF p_type NOT IN ('image/png','image/jpeg','image/webp')
  OR p_bytes IS NULL OR octet_length(p_bytes) NOT BETWEEN 12 AND 524288
 THEN RETURN false; END IF;
 IF NOT EXISTS(
  SELECT 1 FROM hollowgate_vtt.character_drafts d
  JOIN hollowgate_vtt.campaigns c ON c.id=d.campaign_id AND c.owner_id=d.owner_id
  JOIN hollowgate_auth.users actor ON actor.id=d.owner_id
   AND actor.status='active' AND actor.email_verified_at IS NOT NULL
  WHERE d.id=p_character AND d.campaign_id=p_campaign
   AND ((d.owner_id=p_user AND (d.logical_owner_id IS NULL OR d.logical_owner_id=p_user)
         AND d.status IN ('draft','active'))
    OR (d.status='active' AND d.available_for_players=true AND
     EXISTS(
      SELECT 1 FROM hollowgate_vtt.character_claims cl
      JOIN hollowgate_vtt.campaign_members m ON m.campaign_id=cl.campaign_id
       AND m.user_id=cl.player_id AND m.status='active' AND m.member_role='player'
      JOIN hollowgate_auth.users pu ON pu.id=m.user_id
       AND pu.status='active' AND pu.email_verified_at IS NOT NULL
      WHERE cl.character_id=d.id AND cl.campaign_id=d.campaign_id AND cl.player_id=p_user
     )))
 ) THEN RETURN false; END IF;
 INSERT INTO hollowgate_vtt.character_portraits(character_id,mime_type,bytes)
 VALUES(p_character,p_type,p_bytes)
 ON CONFLICT(character_id) DO UPDATE SET mime_type=EXCLUDED.mime_type,bytes=EXCLUDED.bytes,updated_at=now();
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION hollowgate_vtt.list_owned_character_claims(
 p_owner uuid,p_campaign uuid)
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

-- Global logical-owner listing (read at most 101, service slices to the cursor).
CREATE FUNCTION hollowgate_vtt.list_logical_owner_characters(
 p_owner uuid,p_after uuid DEFAULT NULL)
RETURNS TABLE(id uuid,campaign_id uuid,owner_id uuid,logical_owner_id uuid,
 original_owner_id uuid,claimable_origin boolean,ruleset text,name text,sheet_data jsonb,
 status text,available_for_players boolean,created_at timestamptz,updated_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT d.id,d.campaign_id,d.owner_id,d.logical_owner_id,d.original_owner_id,d.claimable_origin,
  d.ruleset,d.name,d.sheet_data,d.status,d.available_for_players,d.created_at,d.updated_at
 FROM hollowgate_vtt.character_drafts d
 JOIN hollowgate_auth.users u ON u.id=d.owner_id
 WHERE d.status='active'
  AND (d.logical_owner_id=p_owner OR (d.logical_owner_id IS NULL AND d.owner_id=p_owner))
  AND (p_after IS NULL OR d.id>p_after)
  AND u.status='active' AND u.email_verified_at IS NOT NULL
 ORDER BY d.id LIMIT 101
$$;

-- Atomic assign/detach with original ruleset compatibility and logical ownership.
CREATE FUNCTION hollowgate_vtt.assign_logical_character_to_campaign(
 p_actor uuid,p_character uuid,p_campaign uuid)
RETURNS TABLE(outcome text,campaign_id uuid,ruleset text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_logical_owner_id uuid;v_campaign_id uuid;v_owner_id uuid;v_status text;v_ruleset text;
 v_may_manage boolean:=false; v_target_ruleset text; v_effective text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM hollowgate_auth.users u
   WHERE u.id=p_actor AND u.status='active' AND u.email_verified_at IS NOT NULL) THEN
  RETURN QUERY SELECT 'forbidden'::text,NULL::uuid,NULL::text;RETURN;
 END IF;
 SELECT d.logical_owner_id,d.campaign_id,d.owner_id,d.status,d.ruleset
  INTO v_logical_owner_id,v_campaign_id,v_owner_id,v_status,v_ruleset
  FROM hollowgate_vtt.character_drafts d
  WHERE d.id=p_character
  FOR UPDATE OF d;
 IF NOT FOUND OR v_status='archived' THEN
  RETURN QUERY SELECT 'not_found'::text,NULL::uuid,NULL::text;RETURN;
 END IF;
 v_may_manage := COALESCE(v_logical_owner_id,v_owner_id)=p_actor;
 IF NOT v_may_manage THEN
  RETURN QUERY SELECT 'forbidden'::text,NULL::uuid,NULL::text;RETURN;
 END IF;
 IF p_campaign IS NULL THEN
  DELETE FROM hollowgate_vtt.character_player_assignments WHERE character_id=p_character;
  DELETE FROM hollowgate_vtt.character_claims WHERE character_id=p_character;
  UPDATE hollowgate_vtt.character_drafts SET campaign_id=NULL,updated_at=now() WHERE id=p_character;
  RETURN QUERY SELECT 'detached'::text,NULL::uuid,NULL::text;RETURN;
 END IF;
 IF NOT EXISTS(
  SELECT 1 FROM hollowgate_vtt.campaigns c
  WHERE c.id=p_campaign AND (
   c.owner_id=p_actor OR EXISTS(
    SELECT 1 FROM hollowgate_vtt.campaign_members m
    JOIN hollowgate_auth.users u ON u.id=m.user_id
     AND u.status='active' AND u.email_verified_at IS NOT NULL
    WHERE m.campaign_id=c.id AND m.user_id=p_actor
     AND m.status='active' AND m.member_role='player'
   )
  )
 ) THEN
  RETURN QUERY SELECT 'not_found'::text,NULL::uuid,NULL::text;RETURN;
 END IF;
 SELECT c.ruleset INTO v_target_ruleset FROM hollowgate_vtt.campaigns c WHERE c.id=p_campaign;
 IF v_ruleset IS NOT NULL AND v_ruleset<>v_target_ruleset THEN
  RETURN QUERY SELECT 'ruleset_mismatch'::text,NULL::uuid,NULL::text;RETURN;
 END IF;
 v_effective:=COALESCE(v_ruleset,v_target_ruleset);
 IF v_campaign_id IS DISTINCT FROM p_campaign THEN
  DELETE FROM hollowgate_vtt.character_player_assignments WHERE character_id=p_character;
  DELETE FROM hollowgate_vtt.character_claims WHERE character_id=p_character;
 END IF;
 UPDATE hollowgate_vtt.character_drafts
 SET campaign_id=p_campaign,ruleset=v_effective,updated_at=now() WHERE id=p_character;
 RETURN QUERY SELECT 'assigned'::text,p_campaign::uuid,v_effective::text;RETURN;
END $$;

REVOKE ALL ON FUNCTION hollowgate_vtt.claim_available_character(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.list_claimable_characters(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.release_claimed_character(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.get_player_character_claim(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.save_claimed_character_sheet(uuid,uuid,uuid,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.save_authorized_character_portrait(uuid,uuid,uuid,text,bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.list_owned_character_claims(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.revoke_invalid_character_assignments() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.claim_available_character(uuid,uuid),
  hollowgate_vtt.list_claimable_characters(uuid,uuid),
  hollowgate_vtt.release_claimed_character(uuid,uuid),
  hollowgate_vtt.get_player_character_claim(uuid,uuid),
  hollowgate_vtt.save_claimed_character_sheet(uuid,uuid,uuid,text,jsonb),
  hollowgate_vtt.save_authorized_character_portrait(uuid,uuid,uuid,text,bytea),
  hollowgate_vtt.list_owned_character_claims(uuid,uuid),
  hollowgate_vtt.revoke_invalid_character_assignments()
  TO hollowgate_api_runtime;
REVOKE ALL ON FUNCTION hollowgate_vtt.list_logical_owner_characters(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.assign_logical_character_to_campaign(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.list_logical_owner_characters(uuid,uuid) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.assign_logical_character_to_campaign(uuid,uuid,uuid) TO hollowgate_api_runtime;
COMMIT;
