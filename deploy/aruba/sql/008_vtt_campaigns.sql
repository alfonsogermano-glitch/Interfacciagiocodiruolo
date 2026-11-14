-- 008: New Aruba-native campaigns, staging only. No Supabase data copied.
BEGIN;
CREATE SCHEMA IF NOT EXISTS hollowgate_vtt;
REVOKE ALL ON SCHEMA hollowgate_vtt FROM PUBLIC;
CREATE TABLE IF NOT EXISTS hollowgate_vtt.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES hollowgate_auth.users(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  description text NOT NULL DEFAULT '' CHECK (length(description)<=4000),
  ruleset text NOT NULL CHECK(ruleset IN ('hsc','dnd5e','pathfinder','coc7e','cocclassic','custom')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_opened_at timestamptz
);
CREATE INDEX IF NOT EXISTS campaigns_owner_idx ON hollowgate_vtt.campaigns(owner_id,created_at DESC);
REVOKE ALL ON ALL TABLES IN SCHEMA hollowgate_vtt FROM PUBLIC, hollowgate_api_runtime;

-- Runtime has no direct SELECT/INSERT/UPDATE/DELETE on campaigns. Routines
-- explicitly authorize the active session user, never a browser-supplied ID.
CREATE OR REPLACE FUNCTION hollowgate_vtt.list_owned_campaigns(p_owner uuid)
RETURNS TABLE(id uuid,name text,description text,ruleset text,owner_id uuid,
 created_at timestamptz,updated_at timestamptz,last_opened_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $$
 SELECT c.id,c.name,c.description,c.ruleset,c.owner_id,
        c.created_at,c.updated_at,c.last_opened_at
 FROM hollowgate_vtt.campaigns c
 JOIN hollowgate_auth.users u ON u.id=c.owner_id
 WHERE c.owner_id=p_owner AND u.status='active' AND u.email_verified_at IS NOT NULL
 ORDER BY c.created_at DESC,c.id
 LIMIT 100
$$;
CREATE OR REPLACE FUNCTION hollowgate_vtt.create_owned_campaign(
 p_owner uuid,p_name text,p_description text,p_ruleset text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $$
DECLARE v_id uuid;
BEGIN
 IF p_owner IS NULL OR NOT EXISTS (
    SELECT 1 FROM hollowgate_auth.users u
    WHERE u.id=p_owner AND u.status='active' AND u.email_verified_at IS NOT NULL
 ) THEN RAISE EXCEPTION 'Invalid active user' USING ERRCODE='22023'; END IF;
 IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 100
 OR p_description IS NULL OR length(p_description)>4000
 OR p_ruleset IS NULL OR p_ruleset NOT IN ('hsc','dnd5e','pathfinder','coc7e','cocclassic','custom')
 THEN RAISE EXCEPTION 'Invalid campaign input' USING ERRCODE='22023'; END IF;
 INSERT INTO hollowgate_vtt.campaigns(owner_id,name,description,ruleset)
 VALUES(p_owner,btrim(p_name),p_description,p_ruleset)
 RETURNING id INTO v_id;
 RETURN v_id;
END $$;

-- No PUBLIC default EXECUTE on SECURITY DEFINER functions.
REVOKE ALL ON FUNCTION hollowgate_vtt.list_owned_campaigns(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.create_owned_campaign(uuid,text,text,text) FROM PUBLIC;
GRANT USAGE ON SCHEMA hollowgate_vtt TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.list_owned_campaigns(uuid) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.create_owned_campaign(uuid,text,text,text) TO hollowgate_api_runtime;
COMMIT;
