-- 028: CI-only, GM-controlled character-to-player assignments.
-- A published/available GM-owned active PG may be assigned to one verified
-- active player in the SAME campaign. Ownership never changes.
BEGIN;
CREATE TABLE hollowgate_vtt.character_player_assignments (
 character_id uuid PRIMARY KEY REFERENCES hollowgate_vtt.character_drafts(id) ON DELETE RESTRICT,
 campaign_id uuid NOT NULL REFERENCES hollowgate_vtt.campaigns(id) ON DELETE RESTRICT,
 player_id uuid NOT NULL REFERENCES hollowgate_auth.users(id) ON DELETE RESTRICT,
 assigned_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX character_player_assignments_campaign_player_idx
 ON hollowgate_vtt.character_player_assignments(campaign_id,player_id);
REVOKE ALL ON hollowgate_vtt.character_player_assignments FROM PUBLIC,hollowgate_api_runtime;

CREATE FUNCTION hollowgate_vtt.set_owned_character_player_assignment(
 p_owner uuid,p_campaign uuid,p_character uuid,p_player uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_valid boolean;v_count bigint;
BEGIN
 -- Lock the character and campaign owner; no guessing rights from display names.
 SELECT true INTO v_valid FROM hollowgate_vtt.character_drafts d
 JOIN hollowgate_vtt.campaigns c ON c.id=d.campaign_id AND c.owner_id=p_owner
 JOIN hollowgate_auth.users u ON u.id=p_owner AND u.status='active'
  AND u.email_verified_at IS NOT NULL
 WHERE d.id=p_character AND d.campaign_id=p_campaign AND d.owner_id=p_owner
  AND d.status='active' FOR UPDATE OF d;
 IF v_valid IS DISTINCT FROM true THEN RETURN false;END IF;
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
 -- No silent assignment of drafts or currently unavailable PGs.
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

CREATE FUNCTION hollowgate_vtt.list_owned_character_player_assignments(
 p_owner uuid,p_campaign uuid)
RETURNS TABLE(character_id uuid,player_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT a.character_id,a.player_id FROM hollowgate_vtt.character_player_assignments a
 JOIN hollowgate_vtt.character_drafts d ON d.id=a.character_id
  AND d.campaign_id=a.campaign_id AND d.owner_id=p_owner AND d.status='active'
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

-- Removing or changing a player's campaign role invalidates assignments
-- permanently. Reactivating a membership cannot silently restore old PGs.
CREATE FUNCTION hollowgate_vtt.revoke_invalid_character_assignments()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF NEW.status<>'active' OR NEW.member_role<>'player' THEN
  DELETE FROM hollowgate_vtt.character_player_assignments
  WHERE campaign_id=NEW.campaign_id AND player_id=NEW.user_id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER character_assignment_on_member_change
 AFTER UPDATE OF status,member_role ON hollowgate_vtt.campaign_members
 FOR EACH ROW EXECUTE FUNCTION hollowgate_vtt.revoke_invalid_character_assignments();

REVOKE ALL ON FUNCTION hollowgate_vtt.set_owned_character_player_assignment(uuid,uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.list_owned_character_player_assignments(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.revoke_invalid_character_assignments() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.set_owned_character_player_assignment(uuid,uuid,uuid,uuid) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.list_owned_character_player_assignments(uuid,uuid) TO hollowgate_api_runtime;
COMMIT;
