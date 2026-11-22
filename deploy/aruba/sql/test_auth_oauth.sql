-- Run only on a disposable database after 001-005 and 036. Never mutates
-- permanent rows: the entire test runs under one rollback transaction.
BEGIN;
SET LOCAL ROLE hollowgate_api_runtime;
DO $$
DECLARE v_id uuid;
BEGIN
  IF has_table_privilege(current_user,'hollowgate_auth.oauth_identities','SELECT') OR
     has_table_privilege(current_user,'hollowgate_auth.oauth_attempts','SELECT') THEN
    RAISE EXCEPTION 'OAuth tables must not have direct runtime grants';
  END IF;
  PERFORM hollowgate_auth.begin_oauth(
    decode(repeat('11',32),'hex'),decode(repeat('22',32),'hex'),
    'google',repeat('a',43),repeat('b',43),NULL,NULL);
  IF (SELECT count(*) FROM hollowgate_auth.consume_oauth(
    decode(repeat('11',32),'hex'),decode(repeat('33',32),'hex'),'google'))<>0 THEN
    RAISE EXCEPTION 'Wrong browser consumed OAuth state';
  END IF;
  IF (SELECT count(*) FROM hollowgate_auth.consume_oauth(
    decode(repeat('11',32),'hex'),decode(repeat('22',32),'hex'),'google'))<>1 THEN
    RAISE EXCEPTION 'Valid OAuth state not consumed';
  END IF;
  IF (SELECT count(*) FROM hollowgate_auth.consume_oauth(
    decode(repeat('11',32),'hex'),decode(repeat('22',32),'hex'),'google'))<>0 THEN
    RAISE EXCEPTION 'OAuth state was replayed';
  END IF;
  v_id=hollowgate_auth.finish_oauth('google','subject-new','new@example.invalid','Player',NULL);
  IF v_id IS NULL OR
     hollowgate_auth.finish_oauth('google','subject-new','new@example.invalid','Player',NULL)<>v_id OR
     hollowgate_auth.finish_oauth('discord','different','new@example.invalid','Player',NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'OAuth identity collision or replay policy failed';
  END IF;
  IF hollowgate_auth.finish_oauth('discord','different','new@example.invalid','Player',v_id)<>v_id OR
     hollowgate_auth.finish_oauth('discord','different','new@example.invalid','Player',NULL)<>v_id OR
     hollowgate_auth.finish_oauth('discord','unverified-link','other@example.invalid','Player',v_id) IS NOT NULL THEN
    RAISE EXCEPTION 'Explicit social linking or linked login failed';
  END IF;
END $$;
ROLLBACK;
