# Hollowgate — P1B.1 Public RLS + Foreign-Key Index Hardening Report

Date: 2026-08-22
Branch: `hardening/p1b1-public-rls-fk-indexes`
Base: `main` at P1A merge `83e359869866d34a2dcb8047f7f6af495e936a3f`

## Result

P1B.1 has been applied to the live Supabase project and verified against authorization, schema, advisor, and data invariants.

Live migration name:

`p1b1_public_rls_fk_indexes`

Final migration source commit:

`5bef4b1193febc33b0c235045922ff1872d18609`

Migration source:

`supabase-p1b1-public-rls-fk-indexes.sql`

No frontend, Edge Function, Realtime policy, Storage policy, legacy KV index, unused pre-existing index, table row, column, trigger, function, or foreign-key definition was intentionally changed by P1B.1.

## Scope delivered

P1B.1 changed exactly the approved database-performance surface:

- 47 `public` RLS policies were changed from direct `auth.uid()` evaluation to init-plan form using `(select auth.uid())`;
- five non-unique B-tree indexes were added for previously uncovered foreign keys.

The four `realtime.messages` init-plan warnings remain intentionally outside this phase.

The legacy KV duplicate-index warning remains intentionally outside this phase.

Pre-existing unused-index INFO findings were not used as a reason to drop any index.

## RED baseline

Before migration, direct-call detection found:

- public policies with direct `auth.uid()`: **47**;
- realtime policies with direct `auth.uid()`: **4**.

The five target foreign keys all reported `has_covering_index = false`:

1. `characters_portrait_asset_id_fkey`
2. `entity_notes_campaign_id_fkey`
3. `monsters_portrait_asset_id_fkey`
4. `news_posts_author_id_fkey`
5. `npcs_portrait_asset_id_fkey`

## Preflight discovery and correction

The first implementation-plan detector used a raw text condition equivalent to:

```sql
... like '%auth.uid()%'
```

A transactional preflight proved that this detector was too broad: PostgreSQL serializes the desired init-plan form in `pg_policies` as:

```text
(( SELECT auth.uid() AS uid))
```

so the raw text condition still counted optimized policies.

No live change occurred: the preflight ended in `ROLLBACK`.

The corrected detector removes the canonical init-plan substring before looking for residual direct calls:

```sql
replace(
  coalesce(qual, '') || ' ' || coalesce(with_check, ''),
  '( SELECT auth.uid() AS uid)',
  ''
) like '%auth.uid()%'
```

RED with the corrected detector:

- public direct policies: **47**;
- realtime direct policies: **4**.

Transactional GREEN with the corrected detector:

- public direct policies: **0**;
- public policies containing canonical init-plan form: **47**;
- five target indexes visible inside the transaction: **5**.

The transaction was rolled back before the live migration.

## Deployment format

A fully expanded 47-statement migration payload was versioned first, but the connector rejected the oversized static deployment payload before it reached Supabase.

To keep the approved scope while avoiding an oversized tool request, the final committed migration uses a closed 47-name target array and generates `ALTER POLICY` statements only for those approved names.

Safety properties of the compact migration:

- target array cardinality must equal 47;
- total public direct-call policy count must equal 47 before execution;
- matching approved direct-call target count must equal 47 before execution;
- only names from the closed target array are altered;
- postcondition requires zero remaining public direct-call policies;
- postcondition requires all five approved indexes to exist.

This prevents a future or unrelated policy from being picked up accidentally.

## Structural GREEN

Immediately after the live migration:

- public direct `auth.uid()` policies: **0**;
- public target policies in canonical init-plan form: **47**;
- realtime direct `auth.uid()` policies: **4** (expected, deferred to P1B.2).

All 47 approved target policy rows still exist.

Policy commands and roles were not changed by the migration; the migration alters only `USING` / `WITH CHECK` expressions through `ALTER POLICY`.

## Added indexes

The five added indexes are:

```sql
CREATE INDEX idx_characters_portrait_asset ON public.characters USING btree (portrait_asset_id);
CREATE INDEX idx_entity_notes_campaign ON public.entity_notes USING btree (campaign_id);
CREATE INDEX idx_monsters_portrait_asset ON public.monsters USING btree (portrait_asset_id);
CREATE INDEX idx_news_posts_author ON public.news_posts USING btree (author_id);
CREATE INDEX idx_npcs_portrait_asset ON public.npcs USING btree (portrait_asset_id);
```

After migration, all five corresponding foreign keys report `has_covering_index = true`.

The foreign-key definitions remained:

```text
characters_portrait_asset_id_fkey: FOREIGN KEY (portrait_asset_id) REFERENCES image_assets(id)
entity_notes_campaign_id_fkey: FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
monsters_portrait_asset_id_fkey: FOREIGN KEY (portrait_asset_id) REFERENCES image_assets(id)
news_posts_author_id_fkey: FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE SET NULL
npcs_portrait_asset_id_fkey: FOREIGN KEY (portrait_asset_id) REFERENCES image_assets(id)
```

## Authorization-equivalence test identities

A production relationship with meaningful entity data was selected without creating any user/profile:

- campaign: `b597f5f7-1dc8-42f1-aa2e-c0de3a79e20b`;
- campaign owner: `3c298159-e7d1-4507-ad06-b44765968162`;
- campaign member: `d27cc1ab-377a-496a-af2d-4333e9125459`;
- unrelated outsider profile: `027f5ee0-4214-42cb-b769-414c6ceeba01`.

These IDs were used only for runtime verification and are not embedded in the migration logic except the already-existing news-admin UUID that was part of the pre-existing policy.

## Read matrix before and after

The following RLS-visible counts were captured before migration and repeated after migration.

### Owner

```text
campaign row: 1
campaign membership rows: 1
characters: 4
adventures: 2
environments: 1
NPCs: 3
monsters: 3
own profile: 1
other profile: 0
own notifications: 0
```

Post-migration values were exactly identical.

### Member

```text
campaign row: 0
campaign membership rows: 1
characters: 4
adventures: 2
environments: 1
NPCs: 0
monsters: 0
own profile: 1
other profile: 0
own notifications: 2
```

Post-migration values were exactly identical.

The chosen campaign's three NPCs and three monsters were hidden from players at baseline, so zero was the expected member result.

### Outsider

```text
campaign row: 0
campaign membership rows: 0
characters: 0
adventures: 0
environments: 0
NPCs: 0
monsters: 0
own profile: 1
other profile: 0
own notifications: 0
```

Post-migration values were exactly identical.

## Visibility-branch test

Inside one transaction, one existing NPC and one existing monster were temporarily changed to `visible_to_players=true`.

Under the campaign-member identity:

- visible NPC rows: expected 1, observed 1;
- visible monster rows: expected 1, observed 1.

Under the outsider identity:

- visible NPC rows: expected 0, observed 0;
- visible monster rows: expected 0, observed 0.

The transaction ended in `ROLLBACK`; both records returned to their original hidden state.

Result: **PASS**.

## Write-path tests

All write probes ended in `ROLLBACK`.

### Character direct-owner policy

Existing owner-owned character tested:

`f1792b8e-8265-4756-8436-698e36fdea8e`

No-op-safe update result:

```text
owner: 1 row
member: 0 rows
outsider: 0 rows
```

Result: **PASS**.

### Campaign-owner nested `EXISTS` policy

Existing environment tested:

`990e7921-3818-4e72-b6bd-1eb78c93b950`

No-op-safe update result:

```text
campaign owner: 1 row
member: 0 rows
outsider: 0 rows
```

Result: **PASS**.

### Profile self-only policy

No-op-safe profile update result:

```text
self profile: 1 row
other profile: 0 rows
```

Result: **PASS**.

### News admin predicate

The pre-existing admin-only UUID predicate was evaluated with the init-plan form:

```text
configured admin identity: true
outsider identity: false
```

Result: **PASS**.

## WITH CHECK verification limitation

A rollback-only `INSERT` probe for `campaigns_insert_own` was attempted, but the connector safety layer blocked the write request before it reached Supabase.

The safety filter was not bypassed.

`WITH CHECK` coverage therefore relies on:

1. exact policy metadata review showing the approved policy identity/command/roles unchanged;
2. the only expression change being direct `auth.uid()` -> init-plan `SELECT auth.uid()`;
3. canonical init-plan form present on all 47 target policy rows;
4. successful write-path RLS behavior on UPDATE policies with both direct and nested predicates;
5. Performance Advisor no longer reporting the public init-plan findings.

No persistent test row was created.

## Production row-count invariants

Before P1B.1:

```text
campaigns: 44
campaign_members: 13
characters: 12
npcs: 10
monsters: 10
adventures: 4
environments: 5
clues: 1
situations: 1
folders: 0
entity_notes: 78
visual_assets: 9
equipment_catalog: 3
character_equipment: 0
profiles: 51
notifications: 9
image_assets: 6
news_posts: 0
```

After migration and all rollback tests, the counts were exactly the same.

## Excluded-index invariants

All four legacy KV duplicate indexes remain present with the same observed scan counts from the P1B.1 baseline:

```text
kv_store_771c5bfd_key_idx: 0
kv_store_771c5bfd_key_idx1: 16
kv_store_771c5bfd_key_idx2: 4
kv_store_771c5bfd_key_idx3: 30407
```

Pre-existing indexes reported as unused also remain present, including:

```text
idx_environments_adventure
idx_environments_parent
idx_monsters_environment
idx_monsters_adventure
idx_entity_notes_folder
idx_npcs_folder
idx_monsters_folder
idx_folders_deleted_at
idx_folders_parent
```

P1B.1 dropped none of them.

## Performance Advisor after P1B.1

Targeted findings are resolved:

- **0** public `auth_rls_initplan` findings;
- **0** targeted `unindexed_foreign_keys` findings.

Expected findings that remain:

- four `auth_rls_initplan` WARN findings on `realtime.messages` — P1B.2;
- duplicate legacy KV index WARN — P1B.3;
- unused-index INFO findings.

The five newly added FK indexes may initially appear as `unused_index` INFO because the database is small and they have not yet accumulated scan statistics. This is not a contradiction: their purpose is to cover foreign-key maintenance/query paths, and they removed the corresponding `unindexed_foreign_keys` findings.

Supabase remediation references:

- RLS init-plan: https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan
- duplicate index: https://supabase.com/docs/guides/database/database-linter?lint=0009_duplicate_index
- unused index: https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index

## Security Advisor after P1B.1

No new security warning was introduced.

The same pre-existing findings remain:

- INFO: RLS enabled without client policies on server-only `campaign_invite_codes`;
- INFO: RLS enabled without client policies on server-only `entity_notes`;
- INFO: RLS enabled without client policies on legacy server-only KV;
- WARN: leaked-password protection disabled.

Leaked-password remediation reference:

https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Rollback

P1B.1 can be rolled back without data restoration.

### Policy rollback

For the same closed 47-policy target set, restore direct evaluation by replacing PostgreSQL's canonical init-plan substring:

```text
( SELECT auth.uid() AS uid)
```

with:

```text
auth.uid()
```

inside each target policy's current `qual` / `with_check`, using `ALTER POLICY` and preserving policy names/commands/roles.

This reverses the P1B.1 expression-only transformation.

### Index rollback

Drop only the five P1B.1 indexes:

```sql
drop index public.idx_characters_portrait_asset;
drop index public.idx_entity_notes_campaign;
drop index public.idx_monsters_portrait_asset;
drop index public.idx_news_posts_author;
drop index public.idx_npcs_portrait_asset;
```

No row-data rollback is required.

## Remaining merge gates

Before merge to `main`, P1B.1 still requires:

1. complete repository diff review;
2. clean GitHub Actions CI (`npm ci`, `npm run check`);
3. successful Vercel preview deployment;
4. authenticated Hollowgate smoke test;
5. explicit human approval to merge.
