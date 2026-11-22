-- Aruba narrative locations: environment support for NPCs, Monsters, Situations
-- Maps Supabase "environments" table to Aruba narrative content placement system
-- File: deploy/aruba/sql/narrative/003_locations.sql
-- Migration type: Narrative content support
-- Depends on: 001_narrative_content.sql (narrative_content_documents table exists)

BEGIN;

-- Create locations table (environments from Supabase)
CREATE TABLE IF NOT EXISTS hollowgate_vtt.locations(
  id uuid NOT NULL,
  campaign_id uuid NOT NULL REFERENCES hollowgate_vtt.campaigns(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'environment' CHECK(kind IN ('environment','location','place')),
  payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
  PRIMARY KEY(id,campaign_id)
);

CREATE INDEX IF NOT EXISTS locations_campaign_idx ON hollowgate_vtt.locations(campaign_id);
CREATE INDEX IF NOT EXISTS locations_kind_idx ON hollowgate_vtt.locations(campaign_id,kind);

-- Revoke default access
REVOKE ALL ON hollowgate_vtt.locations FROM PUBLIC,hollowgate_api_runtime;

-- Authorization function for location ownership (owner of campaign can manage locations)
CREATE OR REPLACE FUNCTION hollowgate_vtt.location_owner_authorized(p_owner uuid,p_campaign uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
  SELECT EXISTS(
    SELECT 1 FROM hollowgate_vtt.campaigns c 
    JOIN hollowgate_auth.users u ON u.id=c.owner_id
    WHERE c.id=p_campaign AND c.owner_id=p_owner 
    AND u.status='active' AND u.email_verified_at IS NOT NULL
  )
$$;

-- List all locations in a campaign (owner-only)
CREATE OR REPLACE FUNCTION hollowgate_vtt.list_owned_locations(p_owner uuid,p_campaign uuid)
RETURNS TABLE(id uuid,campaign_id uuid,kind text,payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
  SELECT l.id,l.campaign_id,l.kind,l.payload 
  FROM hollowgate_vtt.locations l
  WHERE l.campaign_id=p_campaign AND hollowgate_vtt.location_owner_authorized(p_owner,p_campaign)
  ORDER BY l.payload->>'name',l.id LIMIT 1000
$$;

-- Save or update a location
CREATE OR REPLACE FUNCTION hollowgate_vtt.save_owned_location(p_owner uuid,p_campaign uuid,p_id uuid,p_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF NOT hollowgate_vtt.location_owner_authorized(p_owner,p_campaign) 
    OR p_payload IS NULL 
    OR jsonb_typeof(p_payload)<>'object'
    OR p_payload->>'id' IS DISTINCT FROM p_id::text
    OR p_payload->>'campaignId' IS DISTINCT FROM p_campaign::text
  THEN RETURN NULL; END IF;
  
  INSERT INTO hollowgate_vtt.locations(id,campaign_id,kind,payload) 
    VALUES(p_id,p_campaign,'environment',p_payload)
  ON CONFLICT(id,campaign_id) DO UPDATE SET payload=EXCLUDED.payload;
  
  RETURN p_id;
END $$;

-- Delete a location (with cascade to narrative references that use it)
CREATE OR REPLACE FUNCTION hollowgate_vtt.delete_owned_location(p_owner uuid,p_campaign uuid,p_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT hollowgate_vtt.location_owner_authorized(p_owner,p_campaign) THEN RETURN NULL; END IF;
  
  -- Delete location and clear references in narrative content (fail-closed)
  DELETE FROM hollowgate_vtt.locations WHERE id=p_id AND campaign_id=p_campaign 
  RETURNING id INTO v_id;
  
  -- Clear environmentId from narratives that reference this location
  -- (alternative: REJECT with Exception if references exist)
  UPDATE hollowgate_vtt.narrative_content_documents
  SET payload = payload - 'environmentId'
  WHERE campaign_id=p_campaign AND payload->>'environmentId'=p_id::text;
  
  RETURN v_id;
END $$;

-- Revoke and grant appropriate permissions
REVOKE ALL ON FUNCTION 
  hollowgate_vtt.location_owner_authorized(uuid,uuid),
  hollowgate_vtt.list_owned_locations(uuid,uuid),
  hollowgate_vtt.save_owned_location(uuid,uuid,uuid,jsonb),
  hollowgate_vtt.delete_owned_location(uuid,uuid,uuid)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION 
  hollowgate_vtt.location_owner_authorized(uuid,uuid),
  hollowgate_vtt.list_owned_locations(uuid,uuid),
  hollowgate_vtt.save_owned_location(uuid,uuid,uuid,jsonb),
  hollowgate_vtt.delete_owned_location(uuid,uuid,uuid)
TO hollowgate_api_runtime;

-- Runtime access is exclusively through the owner-authorized SECURITY DEFINER
-- functions above. Aruba PostgreSQL has no Supabase auth.uid() dependency.
REVOKE ALL ON TABLE hollowgate_vtt.locations FROM PUBLIC,hollowgate_api_runtime;

COMMIT;
