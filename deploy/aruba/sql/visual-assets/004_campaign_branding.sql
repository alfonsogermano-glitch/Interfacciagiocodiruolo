BEGIN;
-- Campaign branding: an owned campaign references one logo asset and one
-- cover asset that already belong to the same campaign. Asset ids are never
-- trusted from a browser: every write is owner-authorized, same campaign and
-- verified against the visual asset table. Active campaign members (GM or
-- player) may read exactly those referenced binaries; no arbitrary asset id.
ALTER TABLE hollowgate_vtt.campaigns
 ADD COLUMN IF NOT EXISTS logo_asset_id uuid,
 ADD COLUMN IF NOT EXISTS cover_asset_id uuid;

-- Atomically set/clear both branding references. NULL clears one field.
-- A foreign campaign asset or an unauthorized owner returns zero rows and
-- leaves the campaign unchanged.
CREATE OR REPLACE FUNCTION hollowgate_vtt.set_owned_campaign_branding(
 p_owner uuid,p_campaign uuid,p_logo uuid,p_cover uuid)
RETURNS TABLE(logo_asset_id uuid,cover_asset_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_logo uuid;v_cover uuid;
BEGIN
 IF p_owner IS NULL OR p_campaign IS NULL THEN RETURN; END IF;
 IF NOT EXISTS(
   SELECT 1 FROM hollowgate_auth.users u
   WHERE u.id=p_owner AND u.status='active' AND u.email_verified_at IS NOT NULL
 ) THEN RETURN; END IF;
 IF NOT EXISTS(
   SELECT 1 FROM hollowgate_vtt.campaigns c
   WHERE c.id=p_campaign AND c.owner_id=p_owner
 ) THEN RETURN; END IF;
 IF p_logo IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM hollowgate_vtt.visual_assets a
   WHERE a.id=p_logo AND a.campaign_id=p_campaign
 ) THEN RETURN; END IF;
 IF p_cover IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM hollowgate_vtt.visual_assets a
   WHERE a.id=p_cover AND a.campaign_id=p_campaign
 ) THEN RETURN; END IF;
 UPDATE hollowgate_vtt.campaigns c
 SET logo_asset_id=p_logo,cover_asset_id=p_cover,updated_at=now()
 WHERE c.id=p_campaign AND c.owner_id=p_owner
 RETURNING c.logo_asset_id,c.cover_asset_id INTO v_logo,v_cover;
 IF NOT FOUND THEN RETURN; END IF;
 RETURN QUERY SELECT v_logo,v_cover;
END $$;

-- Keep owner campaign lists constrained to active verified owners, now with
-- the branding references the API turns into authenticated content URLs.
DROP FUNCTION IF EXISTS hollowgate_vtt.list_owned_campaigns(uuid);
CREATE FUNCTION hollowgate_vtt.list_owned_campaigns(p_owner uuid)
RETURNS TABLE(id uuid,name text,description text,ruleset text,owner_id uuid,
 created_at timestamptz,updated_at timestamptz,last_opened_at timestamptz,
 logo_asset_id uuid,cover_asset_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $$
 SELECT c.id,c.name,c.description,c.ruleset,c.owner_id,
        c.created_at,c.updated_at,c.last_opened_at,
        c.logo_asset_id,c.cover_asset_id
 FROM hollowgate_vtt.campaigns c
 JOIN hollowgate_auth.users u ON u.id=c.owner_id
 WHERE c.owner_id=p_owner AND u.status='active' AND u.email_verified_at IS NOT NULL
 ORDER BY c.created_at DESC,c.id
 LIMIT 100
$$;

-- Players discover joined campaigns through their own active membership.
-- The same branding references are exposed, never owner or member emails.
DROP FUNCTION IF EXISTS hollowgate_vtt.list_joined_player_campaigns(uuid);
CREATE FUNCTION hollowgate_vtt.list_joined_player_campaigns(p_player uuid)
RETURNS TABLE(id uuid,owner_id uuid,name text,description text,ruleset text,
 created_at timestamptz,logo_asset_id uuid,cover_asset_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT c.id,c.owner_id,c.name,c.description,c.ruleset,c.created_at,
        c.logo_asset_id,c.cover_asset_id
 FROM hollowgate_vtt.campaign_members m
 JOIN hollowgate_vtt.campaigns c ON c.id=m.campaign_id
 JOIN hollowgate_auth.users u ON u.id=m.user_id
   AND u.status='active' AND u.email_verified_at IS NOT NULL
 JOIN hollowgate_auth.users gm ON gm.id=c.owner_id
   AND gm.status='active' AND gm.email_verified_at IS NOT NULL
 WHERE m.user_id=p_player AND m.status='active' AND m.member_role='player'
 ORDER BY c.created_at DESC,c.id LIMIT 100
$$;

-- An active member may read a branding binary only while the campaign still
-- references that exact asset. Ownership and membership are rechecked here;
-- browser-supplied roles are never accepted.
CREATE OR REPLACE FUNCTION hollowgate_vtt.campaign_branding_asset_referenced(
 p_user uuid,p_campaign uuid,p_asset uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT EXISTS(
  SELECT 1 FROM hollowgate_vtt.campaigns c
  JOIN hollowgate_auth.users u ON u.id=p_user
   AND u.status='active' AND u.email_verified_at IS NOT NULL
  WHERE c.id=p_campaign
    AND (c.logo_asset_id=p_asset OR c.cover_asset_id=p_asset)
    AND (c.owner_id=p_user OR EXISTS(
      SELECT 1 FROM hollowgate_vtt.campaign_members m
      JOIN hollowgate_auth.users mu ON mu.id=m.user_id
       AND mu.status='active' AND mu.email_verified_at IS NOT NULL
      WHERE m.campaign_id=c.id AND m.user_id=p_user AND m.status='active'
    ))
 )
$$;

-- One content endpoint for owner, assigned player and active campaign
-- member. Foreign campaigns never match.
CREATE OR REPLACE FUNCTION hollowgate_vtt.read_authorized_visual_asset(
 p_user uuid,p_campaign uuid,p_id uuid)
RETURNS TABLE(mime_type text,source_data bytea)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT a.source_mime,a.source_data
 FROM hollowgate_vtt.visual_assets a
 WHERE a.id=p_id AND a.campaign_id=p_campaign
   AND (hollowgate_vtt.visual_asset_owner_authorized(p_user,p_campaign)
    OR hollowgate_vtt.player_visual_asset_referenced(p_user,p_campaign,p_id)
    OR hollowgate_vtt.campaign_branding_asset_referenced(p_user,p_campaign,p_id))
$$;

-- Deleting a referenced asset clears only the branding pointer in the same
-- transaction; unrelated assets and campaigns are untouched.
CREATE OR REPLACE FUNCTION hollowgate_vtt.delete_owned_visual_asset(
 p_owner uuid,p_campaign uuid,p_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$
DECLARE v uuid;
BEGIN
 IF NOT hollowgate_vtt.visual_asset_owner_authorized(p_owner,p_campaign) THEN
  RETURN NULL;
 END IF;
 UPDATE hollowgate_vtt.campaigns c
 SET logo_asset_id=CASE WHEN c.logo_asset_id=p_id THEN NULL ELSE c.logo_asset_id END,
     cover_asset_id=CASE WHEN c.cover_asset_id=p_id THEN NULL ELSE c.cover_asset_id END,
     updated_at=now()
 WHERE c.id=p_campaign AND (c.logo_asset_id=p_id OR c.cover_asset_id=p_id);
 DELETE FROM hollowgate_vtt.visual_assets
 WHERE id=p_id AND campaign_id=p_campaign RETURNING id INTO v;
 RETURN v;
END $$;

REVOKE ALL ON FUNCTION
 hollowgate_vtt.set_owned_campaign_branding(uuid,uuid,uuid,uuid),
 hollowgate_vtt.campaign_branding_asset_referenced(uuid,uuid,uuid)
 FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
 hollowgate_vtt.list_owned_campaigns(uuid),
 hollowgate_vtt.list_joined_player_campaigns(uuid),
 hollowgate_vtt.set_owned_campaign_branding(uuid,uuid,uuid,uuid),
 hollowgate_vtt.read_authorized_visual_asset(uuid,uuid,uuid)
 TO hollowgate_api_runtime;
COMMIT;
