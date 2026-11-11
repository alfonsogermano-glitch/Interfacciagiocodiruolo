\set ON_ERROR_STOP on
BEGIN;
INSERT INTO hollowgate_auth.rate_limit_buckets
  (action,subject_digest,window_start)
VALUES ('login',decode(repeat('ab',32),'hex'),date_trunc('minute',now()));

INSERT INTO hollowgate_auth.rate_limit_buckets
  (action,subject_digest,window_start)
VALUES ('login',decode(repeat('ab',32),'hex'),date_trunc('minute',now()))
ON CONFLICT (action,subject_digest,window_start)
DO UPDATE SET hits = hollowgate_auth.rate_limit_buckets.hits + 1,
              updated_at = now();

DO $$
DECLARE result int;
BEGIN
  SELECT hits INTO result FROM hollowgate_auth.rate_limit_buckets
  WHERE action = 'login' AND subject_digest = decode(repeat('ab',32),'hex');
  IF result <> 2 THEN RAISE EXCEPTION 'Atomic counter increment failed'; END IF;

  IF has_table_privilege('public', 'hollowgate_auth.rate_limit_buckets', 'SELECT') THEN
    RAISE EXCEPTION 'Rate limit data must not be public';
  END IF;

  BEGIN
    INSERT INTO hollowgate_auth.rate_limit_buckets(action,subject_digest,window_start)
    VALUES ('login',decode('11','hex'),now());
    RAISE EXCEPTION 'Short subject digest accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO hollowgate_auth.rate_limit_buckets(action,subject_digest,window_start)
    VALUES ('arbitrary',decode(repeat('aa',32),'hex'),now());
    RAISE EXCEPTION 'Unknown action accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
ROLLBACK;
