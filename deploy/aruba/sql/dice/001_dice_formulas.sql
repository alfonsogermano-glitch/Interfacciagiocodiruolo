BEGIN;
CREATE TABLE hollowgate_vtt.dice_formulas(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES hollowgate_vtt.campaigns(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES hollowgate_auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200),
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_secret boolean NOT NULL DEFAULT false,
  icon_name text CHECK(icon_name IS NULL OR length(icon_name) BETWEEN 1 AND 100),
  folder_id uuid,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_items CHECK(jsonb_typeof(items)='array')
);
CREATE INDEX dice_formulas_owner_idx ON hollowgate_vtt.dice_formulas(campaign_id,owner_id,sort_order,created_at);
REVOKE ALL ON hollowgate_vtt.dice_formulas FROM PUBLIC,hollowgate_api_runtime;

CREATE FUNCTION hollowgate_vtt.list_dice_formulas(p_user uuid,p_campaign uuid)
RETURNS SETOF hollowgate_vtt.dice_formulas
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
  SELECT * FROM hollowgate_vtt.dice_formulas
  WHERE campaign_id=p_campaign AND owner_id=p_user
   AND hollowgate_vtt.campaign_member_role(p_user,p_campaign) IS NOT NULL
  ORDER BY sort_order,created_at
$$;

CREATE FUNCTION hollowgate_vtt.create_dice_formula(p_user uuid,p_campaign uuid,p_name text,p_items jsonb,p_secret boolean,p_icon text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF hollowgate_vtt.campaign_member_role(p_user,p_campaign) IS NULL
   OR p_name IS NULL OR length(p_name) NOT BETWEEN 1 AND 200
   OR p_items IS NULL OR jsonb_typeof(p_items)<>'array'
   OR (p_icon IS NOT NULL AND length(p_icon) NOT BETWEEN 1 AND 100)
  THEN RETURN NULL; END IF;
  INSERT INTO hollowgate_vtt.dice_formulas(campaign_id,owner_id,name,items,is_secret,icon_name)
  VALUES(p_campaign,p_user,p_name,p_items,COALESCE(p_secret,false),p_icon)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE FUNCTION hollowgate_vtt.update_dice_formula(p_user uuid,p_id uuid,p_name text,p_items jsonb,p_secret boolean,p_icon text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF p_name IS NOT NULL AND length(p_name) NOT BETWEEN 1 AND 200 THEN RETURN false; END IF;
  IF p_items IS NOT NULL AND jsonb_typeof(p_items)<>'array' THEN RETURN false; END IF;
  IF p_icon IS NOT NULL AND length(p_icon) NOT BETWEEN 1 AND 100 THEN RETURN false; END IF;
  UPDATE hollowgate_vtt.dice_formulas SET
    name=COALESCE(p_name,name),
    items=COALESCE(p_items,items),
    is_secret=COALESCE(p_secret,is_secret),
    icon_name=CASE WHEN p_icon='__NULL__' THEN NULL ELSE COALESCE(p_icon,icon_name) END,
    updated_at=now()
  WHERE id=p_id AND owner_id=p_user;
  RETURN FOUND;
END $$;

CREATE FUNCTION hollowgate_vtt.delete_dice_formula(p_user uuid,p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  DELETE FROM hollowgate_vtt.dice_formulas WHERE id=p_id AND owner_id=p_user;
  RETURN FOUND;
END $$;

CREATE FUNCTION hollowgate_vtt.reorder_dice_formulas(p_user uuid,p_campaign uuid,p_ids uuid[])
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE i integer;
BEGIN
  IF hollowgate_vtt.campaign_member_role(p_user,p_campaign) IS NULL THEN RETURN false; END IF;
  FOR i IN 1..array_length(p_ids,1) LOOP
    UPDATE hollowgate_vtt.dice_formulas SET sort_order=i,updated_at=now()
    WHERE id=p_ids[i] AND campaign_id=p_campaign AND owner_id=p_user;
  END LOOP;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION hollowgate_vtt.list_dice_formulas(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.create_dice_formula(uuid,uuid,text,jsonb,boolean,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.update_dice_formula(uuid,uuid,text,jsonb,boolean,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.delete_dice_formula(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.reorder_dice_formulas(uuid,uuid,uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.list_dice_formulas(uuid,uuid) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.create_dice_formula(uuid,uuid,text,jsonb,boolean,text) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.update_dice_formula(uuid,uuid,text,jsonb,boolean,text) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.delete_dice_formula(uuid,uuid) TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.reorder_dice_formulas(uuid,uuid,uuid[]) TO hollowgate_api_runtime;
COMMIT;
