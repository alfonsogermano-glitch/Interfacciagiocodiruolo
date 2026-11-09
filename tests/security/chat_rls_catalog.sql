-- Hollowgate security regression: run on an isolated staging clone only.
-- Read-only catalog assertions; exit nonzero if broad chat policies remain.
-- Usage: psql -X -v ON_ERROR_STOP=1 -d "$STAGING_DATABASE_URL" -f tests/security/chat_rls_catalog.sql
-- IMPORTANT: this is a *structural* guard, not proof of row-level isolation.
DO $audit$
DECLARE
  broad_count integer;
  policy_count integer;
  rls_enabled boolean;
BEGIN
  SELECT relrowsecurity INTO rls_enabled
    FROM pg_class WHERE oid = 'public.chat_messages'::regclass;
  IF rls_enabled IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'FAIL: RLS disabled on chat_messages';
  END IF;

  SELECT count(*) INTO policy_count
    FROM pg_policies WHERE schemaname='public' AND tablename='chat_messages';
  IF policy_count = 0 THEN
    RAISE EXCEPTION 'FAIL: chat_messages has no policies; verify intentional denial';
  END IF;

  SELECT count(*) INTO broad_count
    FROM pg_policies
   WHERE schemaname='public' AND tablename='chat_messages'
     AND permissive='PERMISSIVE'
     AND (roles && ARRAY['authenticated','public']::name[])
     AND (
       (cmd IN ('SELECT','UPDATE','DELETE','ALL') AND btrim(coalesce(qual,''),' ()')='true')
       OR (cmd IN ('INSERT','UPDATE','ALL') AND btrim(coalesce(with_check,''),' ()')='true')
     );
  IF broad_count > 0 THEN
    RAISE EXCEPTION 'FAIL: % unrestricted permissive authenticated/public chat policies', broad_count;
  END IF;
  RAISE NOTICE 'PASS: RLS enabled and no unconditional authenticated/public chat policies';
END
$audit$;
