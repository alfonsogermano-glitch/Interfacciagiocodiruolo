-- Run ONLY against an isolated staging clone AFTER applying the draft policies.
-- This test is read-only and checks effective permissions, not just catalog rows.
-- Intended to fail on the currently deployed configuration.
DO $test$
DECLARE
  broad_cols text[];
  reactions_allowed boolean;
  owner_policy boolean;
BEGIN
  SELECT array_agg(column_name ORDER BY column_name)
    INTO broad_cols
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='chat_messages'
    AND column_name <> 'reactions'
    AND has_column_privilege('authenticated', 'public.chat_messages', column_name, 'UPDATE');

  IF coalesce(array_length(broad_cols, 1), 0) > 0 THEN
    RAISE EXCEPTION 'FAIL: authenticated can UPDATE protected columns: %', broad_cols;
  END IF;

  SELECT has_column_privilege('authenticated', 'public.chat_messages', 'reactions', 'UPDATE')
    INTO reactions_allowed;
  IF reactions_allowed IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'FAIL: authenticated lacks UPDATE(reactions)';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='chat_messages'
      AND policyname='chat_messages_update_reactions_member'
      AND cmd='UPDATE'
  ) INTO owner_policy;
  IF NOT owner_policy THEN
    RAISE EXCEPTION 'FAIL: member-scoped reaction policy missing';
  END IF;

  RAISE NOTICE 'PASS: only reactions is effectively UPDATE-able and scoped policy exists';
END
$test$;
