-- Align existing note write routines with the 1 MiB lossless TipTap ceiling.
BEGIN;
DO $$
DECLARE routine record; definition text;
BEGIN
 FOR routine IN
  SELECT p.oid
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='hollowgate_vtt'
    AND p.prokind='f'
    AND pg_get_functiondef(p.oid) LIKE '%49152%'
 LOOP
  definition:=replace(pg_get_functiondef(routine.oid),'49152','1048576');
  EXECUTE definition;
 END LOOP;
END $$;
COMMIT;
