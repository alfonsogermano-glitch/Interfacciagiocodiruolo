-- Read-only, aggregate-only diagnosis. No emails, credentials or source payloads.
\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '10s';
SET LOCAL lock_timeout = '2s';
SELECT current_database() AS database, count(*) AS total_campaigns
FROM hollowgate_vtt.campaigns;
SELECT c.name, left(md5(c.id::text),12) AS campaign_ref,
       left(md5(c.owner_id::text),12) AS owner_ref,
       u.status AS owner_status, u.email_verified_at IS NOT NULL AS owner_verified,
       (SELECT count(*) FROM hollowgate_vtt.character_drafts d WHERE d.campaign_id=c.id) AS characters,
       EXISTS(SELECT 1 FROM hollowgate_vtt.list_owned_campaigns(c.owner_id) visible WHERE visible.id=c.id) AS returned_by_owner_routine
FROM hollowgate_vtt.campaigns c
LEFT JOIN hollowgate_auth.users u ON u.id=c.owner_id
WHERE lower(c.name) LIKE '%scuola%' AND lower(c.name) LIKE '%orror%'
ORDER BY c.name;
DO $diagnosis$
DECLARE result jsonb;
BEGIN
 IF to_regclass('hollowgate_vtt.migration_source_records') IS NULL THEN
   RAISE NOTICE 'HISTORICAL_LEDGER_NOT_INSTALLED';
 ELSE
   EXECUTE $query$
     SELECT jsonb_build_object(
       'ledger_total', (SELECT count(*) FROM hollowgate_vtt.migration_source_records),
       'matching_source_campaigns', count(*),
       'operational_targets_present', count(c.id))
     FROM hollowgate_vtt.migration_source_records m
     LEFT JOIN hollowgate_vtt.campaigns c ON c.id::text=m.target_id::text
     WHERE m.source_table='campaigns'
       AND lower(m.source_payload->>'name') LIKE '%scuola%'
       AND lower(m.source_payload->>'name') LIKE '%orror%'
   $query$ INTO result;
   RAISE NOTICE 'HISTORICAL_LEDGER_CHECK: %', result;
 END IF;
 IF to_regclass('hollowgate_vtt.narrative_content_documents') IS NOT NULL THEN
   EXECUTE $query$
     SELECT coalesce(jsonb_agg(summary),'[]'::jsonb) FROM (
       SELECT n.kind,count(*) AS records
       FROM hollowgate_vtt.narrative_content_documents n
       JOIN hollowgate_vtt.campaigns c ON c.id=n.campaign_id
       WHERE lower(c.name) LIKE '%scuola%' AND lower(c.name) LIKE '%orror%'
       GROUP BY n.kind ORDER BY n.kind
     ) summary
   $query$ INTO result;
   RAISE NOTICE 'CAMPAIGN_NARRATIVE_COUNTS: %', result;
 END IF;
END $diagnosis$;
ROLLBACK;
