# Hollowgate — P0.3 Implementation Report

Date: 2026-08-22
Branch: `stabilization/p0`

## Result

P0.3 is complete. PostgreSQL is now the canonical source for campaign existence, campaign membership and invite-code validity. Legacy KV data is retained only as a compatibility/rollback snapshot and is no longer read as campaign authority.

## Pre-cutover inventory

Immediately before migration:

- KV campaign objects: 33
- SQL campaign rows: 36
- campaigns only in KV: 8
- campaigns only in SQL: 11
- KV memberships: 13
- SQL memberships: 6
- memberships only in KV: 7
- memberships only in SQL: 0
- invite-code KV keys: 42

The 11 SQL-only campaigns were not deleted because they still referenced legacy entity data (1 NPC, 5 monsters and 1 adventure in aggregate).

## Schema/backfill

The canonical campaign schema was extended additively with the fields that the KV campaign objects already used, including invite/current-open/media/note-order/session metadata, plus `deleted_at` for conservative legacy hiding.

A structured `campaign_invite_codes` table was added so historical invite-code semantics can be preserved without using `inviteCode:*` KV keys as authority.

Backfill result:

- SQL campaign rows preserved: 44
- active campaigns: 33
- legacy soft-hidden campaigns: 11
- SQL memberships: 13
- SQL invite codes: 42

No campaign, character, NPC, monster, adventure, note or storage object was deleted by the migration.

## Edge Function cutover

The Edge Function campaign/member/invite access paths now go through a SQL-canonical adapter. Existing route response shapes were intentionally retained to minimize behavioral change.

Important properties:

- SQL is written before any KV compatibility mirror;
- campaign reads exclude `deleted_at` legacy rows;
- membership reads come from `campaign_members`;
- player campaign access is derived from `campaign_members` + `campaigns`;
- invite lookup uses `campaign_invite_codes`;
- campaign update accepts an explicit field whitelist instead of arbitrary merge input;
- the old frontend `campaignSyncService.ts` mirror was removed;
- `CampaignContext` no longer creates missing SQL campaigns client-side.

A permanent `scripts/verify-campaign-canonical.mjs` regression gate is part of `npm run check` and fails if canonical campaign reads are reintroduced through KV.

## Rollback snapshot consistency fix

After the SQL cutover, a subtle rollback-only issue was found with TDD: after creating a membership, the SQL-derived `playerCampaigns` read already contained the new campaign, so the old conditional block skipped the KV snapshot write.

The fix introduces `mirrorPlayerCampaignsKv(profileId)`, which derives the snapshot from canonical SQL after the membership write and then writes only the legacy KV mirror. This keeps rollback data synchronized without making KV authoritative again.

The regression gate requires this mirror helper/call so the behavior cannot silently regress.

## Verification evidence

Final clean branch commit for the v77 deployment: `476639e48332840bc64fba9cc67b5204033a2715`.

GitHub Actions run `32592659926`, job `97078755938`:

- `npm ci`: success
- `npm run check`: success
- type-check: success
- canonical campaign regression gate: success
- Vite production build: success

Supabase Edge Function:

- version: 77
- status: ACTIVE
- `verify_jwt`: true
- entrypoint is pinned to immutable GitHub commit `476639e48332840bc64fba9cc67b5204033a2715`

Post-deploy set comparison:

- SQL campaigns total: 44
- SQL active: 33
- SQL soft-hidden: 11
- SQL memberships: 13
- SQL invite codes: 42
- active KV campaign IDs missing from SQL: 0
- active SQL campaign IDs missing from KV snapshot: 0
- KV memberships missing from SQL: 0
- SQL memberships missing from KV snapshot: 0

The previous canonical deployment (v76) also served real authenticated application traffic successfully after cutover, including `/campaigns`, `/campaigns/joined`, notes and trash requests with HTTP 200. Version 77 changes only the rollback `playerCampaigns:*` mirror behavior.

## Rollback

If the SQL-canonical Edge implementation must be rolled back, the prior KV snapshots remain available during this stabilization window. The SQL backfill is intentionally non-destructive and can remain in place while the function is reverted.

The 11 legacy SQL-only campaigns remain soft-hidden rather than deleted, preserving their related entity data for later explicit classification.

## Remaining P0 work

P0.4 performs the final end-to-end/invariant verification, production build/type-check confirmation and Supabase advisor review before P0 closure. No merge to `main` is performed automatically.