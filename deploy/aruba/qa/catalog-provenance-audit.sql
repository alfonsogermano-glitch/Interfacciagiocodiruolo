-- Administrative diagnosis only. No grants, repairs, or runtime dependency.
-- Requires the migration ledger and claim/assignment schema; missing tables
-- must fail, not silently appear as an empty/fully recovered catalog.
-- Output contains counts only: no IDs, names, emails, sheets, notes or media.
\set ON_ERROR_STOP on
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '2s';

WITH current_entities AS (
  SELECT 'characters'::text AS kind, d.id::text AS id,
    d.campaign_id::text AS campaign_id, d.owner_id::text AS physical_owner,
    d.status, 'hollowgate_vtt.character_drafts'::text AS target_table
  FROM hollowgate_vtt.character_drafts d
  UNION ALL
  SELECT n.kind, n.id::text, n.campaign_id::text, NULL, NULL,
    'hollowgate_vtt.narrative_content_documents'
  FROM hollowgate_vtt.narrative_content_documents n
  WHERE n.kind IN ('npcs','monsters')
), sources AS (
  SELECT s.source_table AS kind, lower(s.target_id) AS target_id, s.target_table,
    s.source_payload AS original
  FROM hollowgate_vtt.migration_source_records s
  WHERE s.source_table IN ('characters','npcs','monsters')
), source_targets AS (
  SELECT s.kind, s.target_id, s.target_table, s.original,
    (SELECT count(*) FROM current_entities c WHERE c.kind=s.kind
      AND c.id=s.target_id AND c.target_table=s.target_table) AS matches
  FROM sources s
), current_sources AS (
  SELECT c.*,
    (SELECT count(*) FROM sources s WHERE s.kind=c.kind
      AND s.target_id=c.id AND s.target_table=c.target_table) AS matches
  FROM current_entities c
), historical_character_owners AS (
  -- Non-UUID legacy owners need the migration's userUuid mapping. Do not
  -- compare them as physical UUIDs, or guess ownership from a payload.
  SELECT c.id, c.campaign_id, c.physical_owner,
    lower(s.original->>'owner_profile_id') AS historical_owner
  FROM current_sources c JOIN sources s ON s.kind=c.kind
    AND s.target_id=c.id AND s.target_table=c.target_table
  WHERE c.kind='characters' AND c.matches=1
    AND s.original->>'owner_profile_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
), metrics AS (
  SELECT kind, 'current_rows' AS metric, count(*) AS count
    FROM current_entities GROUP BY kind
  UNION ALL
  SELECT kind, 'ledger_rows', count(*) FROM sources GROUP BY kind
  UNION ALL
  SELECT kind, 'historically_unassigned', count(*) FROM sources
    WHERE original ? 'campaign_id' AND original->'campaign_id'='null'::jsonb GROUP BY kind
  UNION ALL
  SELECT kind, 'historical_placement_unknown', count(*) FROM sources
    WHERE NOT (original ? 'campaign_id') OR
      (original->'campaign_id'<>'null'::jsonb AND
       coalesce(original->>'campaign_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    GROUP BY kind
  UNION ALL
  SELECT kind, 'ledger_target_missing', count(*) FROM source_targets WHERE matches=0 GROUP BY kind
  UNION ALL
  SELECT kind, 'ledger_target_ambiguous', count(*) FROM source_targets WHERE matches>1 GROUP BY kind
  UNION ALL
  SELECT kind, 'current_without_ledger', count(*) FROM current_sources WHERE matches=0 GROUP BY kind
  UNION ALL
  SELECT kind, 'current_multiple_ledger_sources', count(*) FROM current_sources WHERE matches>1 GROUP BY kind
  UNION ALL
  SELECT kind, 'identifier_collision_groups', count(*) FROM (
    SELECT kind,id FROM current_entities GROUP BY kind,id HAVING count(*)>1
  ) collisions GROUP BY kind
  UNION ALL
  SELECT kind, 'historical_owner_needs_user_mapping_or_review', count(*) FROM sources
    WHERE coalesce(original->>'owner_profile_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    GROUP BY kind
  UNION ALL
  SELECT 'characters', 'historical_owner_differs_physical', count(*)
    FROM historical_character_owners WHERE historical_owner<>physical_owner
  UNION ALL
  -- This may mean migration omission OR a later release/revocation. Never
  -- turn this diagnostic into an automatic ownership-restoration UPDATE.
  SELECT 'characters', 'historical_owner_differs_without_current_claim', count(*)
    FROM historical_character_owners h WHERE historical_owner<>physical_owner
      AND NOT EXISTS(SELECT 1 FROM hollowgate_vtt.character_claims cl WHERE cl.character_id::text=h.id)
  UNION ALL
  SELECT 'characters', 'current_claims', count(*) FROM hollowgate_vtt.character_claims
  UNION ALL
  SELECT 'characters', 'current_assignments', count(*) FROM hollowgate_vtt.character_player_assignments
  UNION ALL
  SELECT 'characters', 'claim_assignment_mismatch', count(*)
    FROM hollowgate_vtt.character_claims cl
    LEFT JOIN hollowgate_vtt.character_player_assignments a ON a.character_id=cl.character_id
    WHERE a.character_id IS NULL OR a.campaign_id<>cl.campaign_id OR a.player_id<>cl.player_id
  UNION ALL
  SELECT 'characters', 'claim_physical_context_mismatch', count(*)
    FROM hollowgate_vtt.character_claims cl
    LEFT JOIN hollowgate_vtt.character_drafts d ON d.id=cl.character_id
    LEFT JOIN hollowgate_vtt.campaigns c ON c.id=d.campaign_id
    WHERE d.id IS NULL OR c.id IS NULL OR d.campaign_id<>cl.campaign_id
      OR d.owner_id<>cl.original_owner_id OR c.owner_id<>d.owner_id OR d.status<>'active'
  UNION ALL
  SELECT 'characters', 'assignment_without_claim', count(*)
    FROM hollowgate_vtt.character_player_assignments a
    WHERE NOT EXISTS(SELECT 1 FROM hollowgate_vtt.character_claims cl WHERE cl.character_id=a.character_id)
  UNION ALL
  SELECT 'characters', 'claim_inactive_or_missing_player_membership', count(*)
    FROM hollowgate_vtt.character_claims cl
    WHERE NOT EXISTS(
      SELECT 1 FROM hollowgate_vtt.campaign_members m
      JOIN hollowgate_auth.users u ON u.id=m.user_id
      WHERE m.campaign_id=cl.campaign_id AND m.user_id=cl.player_id
        AND m.status='active' AND m.member_role='player'
        AND u.status='active' AND u.email_verified_at IS NOT NULL
    )
)
SELECT kind, metric, count FROM metrics ORDER BY kind, metric;

ROLLBACK;
