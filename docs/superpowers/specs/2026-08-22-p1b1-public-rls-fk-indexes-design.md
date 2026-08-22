# Hollowgate — P1B.1 Public RLS + Foreign-Key Index Hardening Design

Date: 2026-08-22
Branch: `hardening/p1b1-public-rls-fk-indexes`
Base: `main`

## Purpose

P1B.1 addresses two performance-advisor findings in the `public` schema without changing Hollowgate authorization semantics or touching unrelated database subsystems:

1. `auth_rls_initplan` warnings caused by direct per-row `auth.uid()` calls in public RLS policies;
2. five foreign keys without covering indexes.

The goal is performance hardening only. P1B.1 must not broaden or narrow access, alter application-visible data, change table schemas beyond indexes, or modify Realtime, Storage, Edge Functions, frontend code, legacy KV behavior, or unused indexes.

## Current production baseline

Live audit on 2026-08-22 found:

- 47 `public` RLS policies containing direct `auth.uid()` calls;
- 4 additional `realtime.messages` policies containing direct `auth.uid()` calls — intentionally out of P1B.1 scope;
- 5 public foreign keys without covering indexes;
- legacy KV duplicate indexes reported separately by Performance Advisor;
- several indexes reported as unused, which are intentionally preserved.

Current table sizes are small enough that normal transactional B-tree index creation is acceptable for P1B.1. No table currently requires an out-of-transaction `CREATE INDEX CONCURRENTLY` strategy for this change.

Supabase remediation guidance for the RLS finding is to replace row-by-row calls such as `auth.uid()` with an init-plan expression such as `(select auth.uid())` when the function result is constant for the statement.

Reference: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select

Foreign-key advisor reference: https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys

## Scope

### In scope: public RLS policies

All 47 `public` policies currently reported with direct `auth.uid()` calls are in scope.

The transformation is deliberately mechanical:

- `auth.uid()` becomes `(select auth.uid())`;
- casts remain in the same location or are adjusted only for equivalent SQL syntax;
- policy names remain unchanged;
- policy commands remain unchanged;
- policy roles remain unchanged;
- `USING` and `WITH CHECK` logic remain otherwise unchanged;
- joins, `EXISTS` clauses, visibility rules, ownership rules, membership rules, and admin-ID checks remain unchanged.

Examples of intended equivalence:

```sql
owner_profile_id = (auth.uid())::text
```

becomes:

```sql
owner_profile_id = (select auth.uid())::text
```

and:

```sql
auth.uid() = id
```

becomes:

```sql
(select auth.uid()) = id
```

This is an execution-plan optimization, not an authorization redesign.

### In scope: five missing foreign-key indexes

Add one B-tree index for each currently uncovered foreign key:

1. `public.characters(portrait_asset_id)`
2. `public.entity_notes(campaign_id)`
3. `public.monsters(portrait_asset_id)`
4. `public.news_posts(author_id)`
5. `public.npcs(portrait_asset_id)`

Proposed names:

- `idx_characters_portrait_asset`
- `idx_entity_notes_campaign`
- `idx_monsters_portrait_asset`
- `idx_news_posts_author`
- `idx_npcs_portrait_asset`

Indexes are additive and non-unique. They do not change constraints or referential behavior.

## Explicit exclusions

P1B.1 does **not** modify:

- the 4 `realtime.messages` policies with direct `auth.uid()` calls;
- any `storage.objects` policy;
- any Realtime publication/channel behavior;
- any legacy KV data;
- any KV index;
- any index reported only as `unused_index`;
- any application source file;
- any Edge Function;
- any table column, foreign-key definition, trigger, function, sequence, or row;
- Supabase Auth configuration;
- leaked-password protection.

These exclusions are intentional, not unfinished work.

## P1B decomposition

P1B is split into independent blocks:

### P1B.1 — public RLS + missing FK indexes

This design.

### P1B.2 — Realtime RLS init-plan optimization

Handle the four `realtime.messages` policies separately because they protect channel listen/write semantics and deserve dedicated Realtime smoke tests.

### P1B.3 — legacy KV duplicate-index review

Evaluate the four identical `key text_pattern_ops` indexes separately. Historical scan counts differ materially, including one index with more than 30,000 recorded scans, so consolidation must be evidence-driven rather than automatic.

Unused indexes remain outside these blocks unless a future workload review proves they are safe to remove.

## Migration strategy

Use `ALTER POLICY` rather than drop/recreate wherever PostgreSQL permits it.

Reasoning:

- preserves policy identity and minimizes metadata churn;
- reduces the risk of accidentally changing roles or commands;
- makes the diff easier to audit;
- leaves only the intended expression-level change.

The migration should contain two logical sections:

1. RLS expression optimization for the 47 public policies;
2. creation of the 5 missing B-tree indexes.

No data migration is required.

## Authorization equivalence testing

Removing advisor warnings is not sufficient. P1B.1 must prove that authorization behavior is unchanged.

### Identity matrix

Use three controlled identities where the required relationships exist:

- **owner** — owns the selected campaign/entity;
- **member** — campaign member but not owner;
- **outsider** — authenticated profile with no ownership or membership relation to the selected campaign.

If a real production relationship does not provide all three identities for a specific table, construct the minimum synthetic relationship inside a transaction and finish with `ROLLBACK`.

No persistent synthetic user or profile may be created.

### Read-path assertions

For policy families that expose data to owners or members, verify before and after:

- owner sees exactly the expected rows;
- member sees exactly the expected rows where membership is allowed;
- outsider sees no protected rows;
- visibility-gated NPC/monster access remains unchanged;
- campaign membership visibility remains unchanged;
- profile and notification self-only access remains unchanged.

### Write-path assertions

For representative policy families, verify before and after using transactions ending in `ROLLBACK`:

- permitted owner insert/update/delete remains permitted;
- member writes remain denied where owner-only rules apply;
- outsider writes remain denied;
- `WITH CHECK` behavior is unchanged;
- admin-only news policy behavior is unchanged.

The tests should cover both simple direct predicates and nested `EXISTS` predicates.

### Policy metadata invariants

Capture before and after for all 47 policies:

- schema;
- table;
- policy name;
- command;
- roles;
- `USING` expression;
- `WITH CHECK` expression.

Post-migration review must confirm that the only semantic-text difference is the `auth.uid()` init-plan wrapping.

## Foreign-key index verification

Before migration:

- confirm the five listed foreign keys have no covering index;
- capture existing indexes on the five tables.

After migration:

- each target FK reports `has_covering_index = true`;
- no constraint definition changed;
- no pre-existing index was dropped or renamed;
- row counts are unchanged.

Because these are new indexes, rollback is simply dropping the five new indexes.

## Advisor gates

After P1B.1:

- public-schema `auth_rls_initplan` findings targeted by this phase must be 0;
- the five targeted `unindexed_foreign_keys` findings must be 0;
- the four Realtime init-plan warnings may remain and are expected for P1B.2;
- KV duplicate-index warning may remain and is expected for P1B.3;
- unused-index INFO findings may remain and are expected;
- no new Security Advisor warning may be introduced.

## Data invariants

Capture row counts before and after for at least:

- campaigns;
- campaign_members;
- characters;
- npcs;
- monsters;
- adventures;
- environments;
- clues;
- situations;
- folders;
- entity_notes;
- visual_assets;
- equipment_catalog;
- character_equipment;
- profiles;
- notifications;
- image_assets;
- news_posts.

Expected result: exact equality before vs after.

No test may leave synthetic rows behind.

## Repository deliverables

P1B.1 will add only:

- this design specification;
- a detailed implementation plan;
- one SQL migration source file for P1B.1;
- one implementation/verification report;
- an optional regression-verification script only if needed to make the policy/index contract durable in CI.

Application code should remain untouched unless verification discovers an existing dependency that makes the approved design invalid. If that happens, implementation stops and the design is revisited rather than silently expanding scope.

## Rollback design

### RLS rollback

Restore the exact pre-migration policy expressions captured from `pg_policies`.

Because names, roles and commands are preserved, rollback can use `ALTER POLICY` to restore the original `USING` / `WITH CHECK` expressions.

### Index rollback

Drop only:

- `idx_characters_portrait_asset`
- `idx_entity_notes_campaign`
- `idx_monsters_portrait_asset`
- `idx_news_posts_author`
- `idx_npcs_portrait_asset`

No data rollback is required.

## Verification sequence

1. Confirm branch is based on the current `main` P1A merge.
2. Capture advisor baseline.
3. Capture all 47 public policy definitions and metadata.
4. Capture FK/index baseline and row counts.
5. Run RED authorization and advisor checks proving the current warnings exist.
6. Version the migration source before applying it live.
7. Apply the migration through Supabase migration tooling.
8. Verify policy metadata invariants.
9. Run owner/member/outsider read/write equivalence tests with rollback.
10. Verify the five new indexes and unchanged FK definitions.
11. Re-run Security and Performance Advisors.
12. Verify all row-count and synthetic-row invariants.
13. Run repository CI from a clean install and production build.
14. Open a draft PR against `main`.
15. Require authenticated Hollowgate smoke testing before merge.
16. Merge only after explicit human approval.

## Acceptance criteria

P1B.1 is complete only when all of the following are true:

- all 47 targeted public RLS policies use init-plan-safe `auth.uid()` expressions;
- authorization outcomes for owner/member/outsider are unchanged;
- the five missing FK indexes exist and cover their constraints;
- targeted public `auth_rls_initplan` warnings are gone;
- targeted five `unindexed_foreign_keys` findings are gone;
- Realtime, Storage, KV and unused indexes are unchanged;
- production row counts are unchanged;
- no synthetic test row persists;
- Security Advisor has no new warning caused by P1B.1;
- repository CI is green;
- Vercel preview is green;
- authenticated smoke test passes;
- merge is explicitly approved.
