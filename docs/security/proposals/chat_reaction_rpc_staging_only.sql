-- STAGING PROPOSAL ONLY: do not apply to production without reviews and live tests.
-- Function owner has elevated privileges; every access is explicitly checked.
BEGIN;
CREATE OR REPLACE FUNCTION public.chat_toggle_reaction(
  p_message_id uuid, p_char text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_campaign uuid;
  v_current jsonb;
  v_clean jsonb;
  v_next jsonb;
  v_name text;
  v_allowed boolean;
  v_same boolean;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_char IS NULL OR length(btrim(p_char)) = 0 OR length(p_char) > 16 THEN
    RAISE EXCEPTION 'Invalid reaction' USING ERRCODE = '22023';
  END IF;

  -- Lock first to serialize concurrent reactions on the same message.
  SELECT m.campaign_id, COALESCE(m.reactions, '[]'::jsonb)
    INTO v_campaign, v_current
    FROM public.chat_messages AS m
    WHERE m.id = p_message_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = v_campaign AND c.deleted_at IS NULL
      AND (c.owner_profile_id = v_actor::text
        OR EXISTS (
          SELECT 1 FROM public.campaign_members cm
          WHERE cm.campaign_id = c.id AND cm.profile_id = v_actor::text
        ))
  ) INTO v_allowed;
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Not a campaign participant' USING ERRCODE = '42501';
  END IF;

  SELECT p.display_name INTO v_name
    FROM public.profiles p WHERE p.id = v_actor;
  IF v_name IS NULL OR length(btrim(v_name)) = 0 THEN
    RAISE EXCEPTION 'Missing profile' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(v_current) <> 'array'
     OR jsonb_array_length(v_current) > 100 THEN
    RAISE EXCEPTION 'Invalid stored reactions' USING ERRCODE = '22023';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_current) AS r(item)
    WHERE r.item->>'userId' = v_actor::text AND r.item->>'char' = p_char
  ) INTO v_same;
  SELECT COALESCE(jsonb_agg(r.item), '[]'::jsonb)
    INTO v_clean
    FROM jsonb_array_elements(v_current) AS r(item)
    WHERE (r.item->>'userId') IS DISTINCT FROM v_actor::text;

  IF v_same THEN
    v_next := v_clean;
  ELSE
    IF jsonb_array_length(v_clean) >= 100 THEN
      RAISE EXCEPTION 'Reaction limit exceeded' USING ERRCODE = '22023';
    END IF;
    v_next := v_clean || jsonb_build_array(jsonb_build_object(
      'char', p_char,
      'userId', v_actor::text,
      'userName', v_name,
      'createdAt', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ));
  END IF;

  UPDATE public.chat_messages SET reactions = v_next WHERE id = p_message_id;
  RETURN v_next;
END;
$$;
REVOKE ALL ON FUNCTION public.chat_toggle_reaction(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.chat_toggle_reaction(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.chat_toggle_reaction(uuid, text) TO authenticated;
COMMIT;
