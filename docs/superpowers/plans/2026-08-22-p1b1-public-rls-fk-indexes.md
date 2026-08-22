# P1B.1 Public RLS + Foreign-Key Index Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the 47 `public`-schema `auth_rls_initplan` findings and the 5 targeted unindexed-foreign-key findings without changing Hollowgate authorization semantics or production data.

**Architecture:** P1B.1 is a database-only hardening change. It uses explicit `ALTER POLICY` statements to replace direct `auth.uid()` evaluation with `(select auth.uid())`, preserving policy identity/roles/commands and all other predicates, and adds five non-unique B-tree indexes for uncovered foreign keys. Realtime, Storage, legacy KV indexes, unused indexes, frontend, and Edge Functions stay untouched.

**Tech Stack:** PostgreSQL / Supabase RLS, Supabase migrations/advisors, GitHub Actions CI, Vercel.

**Spec:** `docs/superpowers/specs/2026-08-22-p1b1-public-rls-fk-indexes-design.md`

## Global Constraints

- Modify exactly the 47 currently targeted `public` policies; do not touch the 4 `realtime.messages` policies in P1B.1.
- Transform only direct `auth.uid()` calls to `(select auth.uid())`; preserve policy names, commands, roles, joins, membership logic, visibility logic, admin checks, `USING`, and `WITH CHECK` semantics.
- Add exactly five non-unique B-tree indexes: `idx_characters_portrait_asset`, `idx_entity_notes_campaign`, `idx_monsters_portrait_asset`, `idx_news_posts_author`, `idx_npcs_portrait_asset`.
- Do not drop or rename any existing index, including indexes reported only as unused.
- Do not modify any KV index in P1B.1.
- Do not modify Realtime, Storage, Auth configuration, frontend code, Edge Functions, triggers, functions, columns, foreign-key definitions, or rows.
- No persistent synthetic auth user/profile may be created; all write probes end in `ROLLBACK`.
- Merge remains gated by live advisor checks, authorization-equivalence verification, CI, Vercel, authenticated smoke test, and explicit human approval.

---

### Task 1: Capture RED baseline and rollback snapshots

**Files:**
- Create later: `docs/superpowers/reports/2026-08-22-p1b1-public-rls-fk-indexes-report.md`
- No repository write in this task.

**Interfaces:**
- Consumes: live Supabase project `njcnkovruynhtsgzgrxi`.
- Produces: exact before-state policy definitions, FK definitions, row counts, identity matrix, advisor findings, and existing-index snapshot used by Tasks 2-5.

- [ ] **Step 1: Verify branch ancestry**

Confirm `hardening/p1b1-public-rls-fk-indexes` is based on current `main` and contains only the approved spec/plan before implementation.

Expected base includes P1A merge commit `83e359869866d34a2dcb8047f7f6af495e936a3f` or a later `main` commit if `main` legitimately advanced before execution. If `main` advanced with unrelated changes, compare and rebase only after reviewing them.

- [ ] **Step 2: Run the RED policy-count query**

```sql
select
  count(*) filter (where schemaname = 'public') as public_direct_auth_uid,
  count(*) filter (where schemaname = 'realtime') as realtime_direct_auth_uid
from pg_policies
where (coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%auth.uid()%';
```

Expected before P1B.1:

```text
public_direct_auth_uid = 47
realtime_direct_auth_uid = 4
```

If the public count is not exactly 47, stop implementation and re-audit scope before changing any policy.

- [ ] **Step 3: Capture the exact 47 policy definitions**

```sql
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%auth.uid()%'
order by tablename, policyname;
```

Expected target set, exactly 47 policies:

```text
adventures.adventures_delete_own
adventures.adventures_insert_own
adventures.adventures_select_own_or_member
adventures.adventures_update_own
campaign_members.campaign_members_select_if_member_or_owner
campaigns.campaigns_insert_own
campaigns.campaigns_select_own
campaigns.campaigns_update_own
character_equipment.character_equipment_all_own
characters.characters_delete_own
characters.characters_insert_own
characters.characters_select_own_or_member
characters.characters_update_own
clues.clues_all_own
dashboard_settings.dashboard_settings_delete_own
dashboard_settings.dashboard_settings_insert_own
dashboard_settings.dashboard_settings_select_own
dashboard_settings.dashboard_settings_update_own
environments.environments_delete_own
environments.environments_insert_own
environments.environments_select_own_or_member
environments.environments_update_own
equipment_catalog.equipment_catalog_all_own
folders.folders_delete_own
folders.folders_insert_own
folders.folders_select_own_or_member
folders.folders_update_own
image_assets.image_assets_delete_own
image_assets.image_assets_insert_own
image_assets.image_assets_select_own
image_assets.image_assets_update_own
monsters.monsters_delete_owner
monsters.monsters_insert_owner
monsters.monsters_select_owner_or_visible
monsters.monsters_update_owner
news_posts.news_delete_admin_only
news_posts.news_insert_admin_only
notifications.notifications_select_own
npcs.npcs_delete_owner
npcs.npcs_insert_owner
npcs.npcs_select_owner_or_visible
npcs.npcs_update_owner
profiles.profiles_insert_own
profiles.profiles_select_own
profiles.profiles_update_own
situations.situations_all_own
visual_assets.visual_assets_all_own
```

Save the returned `qual` / `with_check` text in the implementation report as the rollback source of truth.

- [ ] **Step 4: Capture the five uncovered foreign keys and all indexes on their tables**

Run:

```sql
with fk as (
  select
    n.nspname as schema_name,
    c.relname as table_name,
    con.conname,
    con.conkey,
    pg_get_constraintdef(con.oid) as definition
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where con.contype = 'f'
    and n.nspname = 'public'
    and con.conname in (
      'characters_portrait_asset_id_fkey',
      'entity_notes_campaign_id_fkey',
      'monsters_portrait_asset_id_fkey',
      'news_posts_author_id_fkey',
      'npcs_portrait_asset_id_fkey'
    )
)
select * from fk order by table_name, conname;
```

Then capture indexes:

```sql
select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('characters','entity_notes','monsters','news_posts','npcs')
order by tablename, indexname;
```

Expected: the five named FK columns have no covering B-tree index before migration.

- [ ] **Step 5: Capture row counts before any change**

```sql
select
  (select count(*) from public.campaigns) as campaigns,
  (select count(*) from public.campaign_members) as campaign_members,
  (select count(*) from public.characters) as characters,
  (select count(*) from public.npcs) as npcs,
  (select count(*) from public.monsters) as monsters,
  (select count(*) from public.adventures) as adventures,
  (select count(*) from public.environments) as environments,
  (select count(*) from public.clues) as clues,
  (select count(*) from public.situations) as situations,
  (select count(*) from public.folders) as folders,
  (select count(*) from public.entity_notes) as entity_notes,
  (select count(*) from public.visual_assets) as visual_assets,
  (select count(*) from public.equipment_catalog) as equipment_catalog,
  (select count(*) from public.character_equipment) as character_equipment,
  (select count(*) from public.profiles) as profiles,
  (select count(*) from public.notifications) as notifications,
  (select count(*) from public.image_assets) as image_assets,
  (select count(*) from public.news_posts) as news_posts;
```

Record the exact values in the report.

- [ ] **Step 6: Dynamically resolve owner/member/outsider identities**

Use a campaign that has at least one member and an owner present in `profiles`, then choose a profile with no membership/ownership relation to that campaign:

```sql
with candidate as (
  select c.id as campaign_id,
         c.owner_profile_id::uuid as owner_id,
         cm.profile_id::uuid as member_id
  from public.campaigns c
  join public.campaign_members cm on cm.campaign_id = c.id
  join public.profiles po on po.id = c.owner_profile_id::uuid
  join public.profiles pm on pm.id = cm.profile_id::uuid
  where c.deleted_at is null
    and cm.profile_id <> c.owner_profile_id
  order by c.id
  limit 1
), outsider as (
  select p.id as outsider_id
  from public.profiles p, candidate x
  where p.id <> x.owner_id
    and p.id <> x.member_id
    and not exists (
      select 1 from public.campaign_members cm
      where cm.campaign_id = x.campaign_id
        and cm.profile_id = p.id::text
    )
    and not exists (
      select 1 from public.campaigns c
      where c.id = x.campaign_id
        and c.owner_profile_id = p.id::text
    )
  order by p.id
  limit 1
)
select candidate.*, outsider.outsider_id
from candidate cross join outsider;
```

Expected: one row with non-null `campaign_id`, `owner_id`, `member_id`, `outsider_id`.

If no such row exists, build only membership relationships inside a transaction using existing profiles; do not create an auth user/profile.

- [ ] **Step 7: Capture RED authorization matrix before migration**

For each identity, set the authenticated role and JWT subject inside a transaction. Example for the resolved owner:

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '<OWNER_UUID_FROM_STEP_6>', true);
select auth.uid() as simulated_uid;
-- run read assertions here
rollback;
```

Do not persist the UUID into repository files. Record results for these representative families:

```text
campaigns: owner self-read; member/outsider denied owner-only campaign row
campaign_members: member sees own membership; owner sees campaign memberships; outsider sees none
characters: owner sees own/campaign rows; member sees campaign rows; outsider sees none
adventures/environments/folders: owner + member read; outsider denied
npcs/monsters: owner read; member sees only visible_to_players rows; outsider denied
profiles: identity sees self only
notifications: identity sees own notifications only
image_assets: owner_profile_id self-only
```

Use SELECT counts filtered to the chosen campaign/profile and record exact before values. These before values are the expected GREEN values after Task 3.

- [ ] **Step 8: Run advisors to prove RED**

Fetch Performance Advisor.

Expected before migration:

```text
47 public auth_rls_initplan findings in scope
5 unindexed_foreign_keys findings in scope
4 realtime auth_rls_initplan findings remain outside scope
legacy KV duplicate_index warning remains outside scope
unused_index INFO findings remain outside scope
```

Also fetch Security Advisor and record its baseline so later changes can be checked for newly introduced warnings.

---

### Task 2: Version the explicit P1B.1 migration source

**Files:**
- Create: `supabase-p1b1-public-rls-fk-indexes.sql`

**Interfaces:**
- Consumes: exact policy definitions captured in Task 1.
- Produces: one auditable SQL migration source containing exactly 47 `ALTER POLICY` operations and 5 `CREATE INDEX` statements.

- [ ] **Step 1: Create the migration file with safety assertions**

Start the file with a guard block that fails before changing anything if the expected target set has drifted:

```sql
do $$
declare
  v_public_direct_uid_count integer;
begin
  select count(*)
    into v_public_direct_uid_count
  from pg_policies
  where schemaname = 'public'
    and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%auth.uid()%';

  if v_public_direct_uid_count <> 47 then
    raise exception 'P1B1_SCOPE_DRIFT: expected 47 public policies with direct auth.uid(), found %',
      v_public_direct_uid_count;
  end if;
end
$$;
```

- [ ] **Step 2: Generate the exact 47 candidate `ALTER POLICY` statements from the captured live definitions**

Use this read-only generator against the same pre-migration state:

```sql
select tablename, policyname,
  'alter policy ' || quote_ident(policyname) || ' on public.' || quote_ident(tablename) ||
  case when qual is not null
    then E'\n  using (' || replace(qual, 'auth.uid()', '(select auth.uid())') || ')'
    else ''
  end ||
  case when with_check is not null
    then E'\n  with check (' || replace(with_check, 'auth.uid()', '(select auth.uid())') || ')'
    else ''
  end || ';' as alter_sql
from pg_policies
where schemaname = 'public'
  and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%auth.uid()%'
order by tablename, policyname;
```

Copy the 47 generated statements into `supabase-p1b1-public-rls-fk-indexes.sql` as static SQL.

Review each statement against the Task 1 snapshot. The only expression change allowed is `auth.uid()` -> `(select auth.uid())`; PostgreSQL-added parentheses/cast formatting differences are acceptable only when semantically identical.

- [ ] **Step 3: Add the five index statements exactly**

Append:

```sql
create index idx_characters_portrait_asset
  on public.characters (portrait_asset_id);

create index idx_entity_notes_campaign
  on public.entity_notes (campaign_id);

create index idx_monsters_portrait_asset
  on public.monsters (portrait_asset_id);

create index idx_news_posts_author
  on public.news_posts (author_id);

create index idx_npcs_portrait_asset
  on public.npcs (portrait_asset_id);
```

Do not use `if not exists`: an unexpected pre-existing index name should fail loudly and trigger review rather than silently masking drift.

- [ ] **Step 4: Add a postcondition guard**

Append a final guard:

```sql
do $$
declare
  v_public_direct_uid_count integer;
begin
  select count(*)
    into v_public_direct_uid_count
  from pg_policies
  where schemaname = 'public'
    and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%auth.uid()%';

  if v_public_direct_uid_count <> 0 then
    raise exception 'P1B1_POSTCONDITION_FAILED: % public policies still contain direct auth.uid()',
      v_public_direct_uid_count;
  end if;
end
$$;
```

Note: this string-based postcondition is a migration guard only. The authoritative result is Performance Advisor plus policy review in Task 3.

- [ ] **Step 5: Commit the migration source before applying it live**

```bash
git add supabase-p1b1-public-rls-fk-indexes.sql
git commit -m "perf: optimize public RLS and add FK indexes"
```

Expected: branch now contains spec + plan + one SQL migration source; no application file changed.

---

### Task 3: Apply migration and verify structural GREEN

**Files:**
- No new file in this task.

**Interfaces:**
- Consumes: `supabase-p1b1-public-rls-fk-indexes.sql` from Task 2.
- Produces: live P1B.1 schema state with structurally verified policies/indexes.

- [ ] **Step 1: Apply via Supabase migration tooling**

Apply the exact committed SQL as migration name:

```text
p1b1_public_rls_fk_indexes
```

Do not edit the SQL in the migration call independently of the committed file.

- [ ] **Step 2: Verify direct `auth.uid()` counts**

```sql
select
  count(*) filter (where schemaname = 'public') as public_direct_auth_uid,
  count(*) filter (where schemaname = 'realtime') as realtime_direct_auth_uid
from pg_policies
where (coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%auth.uid()%';
```

Expected after P1B.1:

```text
public_direct_auth_uid = 0
realtime_direct_auth_uid = 4
```

- [ ] **Step 3: Verify policy identity metadata did not drift**

Run the same metadata query as Task 1 and compare all 47 target identities:

```sql
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and policyname in (
    'adventures_delete_own','adventures_insert_own','adventures_select_own_or_member','adventures_update_own',
    'campaign_members_select_if_member_or_owner',
    'campaigns_insert_own','campaigns_select_own','campaigns_update_own',
    'character_equipment_all_own',
    'characters_delete_own','characters_insert_own','characters_select_own_or_member','characters_update_own',
    'clues_all_own',
    'dashboard_settings_delete_own','dashboard_settings_insert_own','dashboard_settings_select_own','dashboard_settings_update_own',
    'environments_delete_own','environments_insert_own','environments_select_own_or_member','environments_update_own',
    'equipment_catalog_all_own',
    'folders_delete_own','folders_insert_own','folders_select_own_or_member','folders_update_own',
    'image_assets_delete_own','image_assets_insert_own','image_assets_select_own','image_assets_update_own',
    'monsters_delete_owner','monsters_insert_owner','monsters_select_owner_or_visible','monsters_update_owner',
    'news_delete_admin_only','news_insert_admin_only',
    'notifications_select_own',
    'npcs_delete_owner','npcs_insert_owner','npcs_select_owner_or_visible','npcs_update_owner',
    'profiles_insert_own','profiles_select_own','profiles_update_own',
    'situations_all_own','visual_assets_all_own'
  )
order by tablename, policyname;
```

Expected:

```text
47 rows
same schemaname/table/policy/permissive/roles/cmd as baseline
qual/with_check differ only by init-plan wrapping of auth.uid()
```

- [ ] **Step 4: Verify the five indexes exist and cover the intended FK columns**

```sql
select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'idx_characters_portrait_asset',
    'idx_entity_notes_campaign',
    'idx_monsters_portrait_asset',
    'idx_news_posts_author',
    'idx_npcs_portrait_asset'
  )
order by indexname;
```

Expected: exactly five rows with the intended table/column pairs.

Also re-run the uncovered-FK query from Task 1 and confirm all five target constraints now have a covering index while the FK definitions themselves are byte-for-byte unchanged via `pg_get_constraintdef`.

- [ ] **Step 5: Verify no excluded index was changed**

Re-run the index snapshot for:

```text
kv_store_771c5bfd
environments
folders
monsters
npcs
entity_notes
```

Expected:

```text
all legacy KV indexes still present
all previously unused indexes still present
only the five approved new indexes added
```

---

### Task 4: Prove authorization equivalence with rollback tests

**Files:**
- No repository write in this task; results feed Task 6 report.

**Interfaces:**
- Consumes: identity matrix and before-counts from Task 1; live migrated policies from Task 3.
- Produces: GREEN authorization matrix matching pre-migration outcomes.

- [ ] **Step 1: Re-resolve the same relationship class dynamically**

Run the Task 1 owner/member/outsider CTE again. If it resolves a different campaign due to concurrent product activity, capture new baseline semantics for that relationship before evaluating writes; do not rely on stale IDs.

- [ ] **Step 2: Compare representative owner/member/outsider read outcomes**

For each identity, use:

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '<RUNTIME_UUID>', true);
select auth.uid() as simulated_uid;
-- SELECT assertions
rollback;
```

The following results must match the Task 1 before-state semantics:

```text
campaigns owner-only row visibility
campaign_members member-self / campaign-owner visibility
characters owner/member/outsider visibility
adventures owner/member/outsider visibility
environments owner/member/outsider visibility
folders owner/member/outsider visibility
visible vs hidden NPC behavior for member
visible vs hidden monster behavior for member
profiles self-only visibility
notifications self-only visibility
image_assets owner-only visibility
```

Any access broadening or narrowing is a blocker and requires rollback/review.

- [ ] **Step 3: Verify simple write policies under the authenticated role**

Use existing rows and transactions ending in rollback.

Owner-update example for a character, changing only a reversible non-origin field that does not violate P1A trigger rules:

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '<RUNTIME_OWNER_UUID>', true);
update public.characters
set updated_at = updated_at
where id = '<RUNTIME_CHARACTER_UUID>';
select count(*) as matched_row
from public.characters
where id = '<RUNTIME_CHARACTER_UUID>';
rollback;
```

Expected: owner path remains permitted.

Repeat with the member/outsider identity against an owner-only writable row and verify no protected row is changed.

- [ ] **Step 4: Verify nested-`EXISTS` write policies**

Use a campaign-owned entity family such as `environments`, `folders`, `clues`, `situations`, or `equipment_catalog` where a real row exists. If a needed row does not exist, insert the minimum synthetic row inside the transaction as service/admin, then switch to `authenticated` for the authorization probe and end with `ROLLBACK`.

Expected:

```text
campaign owner write permitted
member write denied
outsider write denied
```

- [ ] **Step 5: Verify NPC/monster visibility and owner-only writes**

For an existing campaign with a member:

```text
owner can read visible and hidden NPCs/monsters in own campaign
member can read visible_to_players=true rows only
member cannot update/delete owner rows
outsider sees neither visible nor hidden campaign rows
```

If the campaign lacks both visibility states, temporarily toggle one existing row or synthesize a row inside a transaction and roll back.

- [ ] **Step 6: Verify `WITH CHECK` behavior**

Representative insert probes must demonstrate:

```text
characters_insert_own: owner_profile_id must equal auth.uid()
campaigns_insert_own: owner_profile_id must equal auth.uid()
profiles_insert_own: id must equal auth.uid()
image_assets_insert_own: owner_profile_id must equal auth.uid()
```

Use generated UUIDs only inside `BEGIN`/`ROLLBACK` and satisfy unrelated NOT NULL columns with schema-valid values discovered from catalog inspection. No synthetic row may persist.

- [ ] **Step 7: Verify admin-only news semantics without creating a news row**

Identify whether the configured admin UUID has a profile/auth row. Simulate that subject and a non-admin subject under `authenticated` and evaluate the policy through a rollback insert/delete probe only if a schema-valid row can be constructed safely.

Minimum acceptable proof if `news_posts` has no rows and constructing a valid insert would require unrelated product data: confirm the policy expression changed only from `auth.uid()` to `(select auth.uid())`, roles/cmd are unchanged, and evaluate both predicates directly:

```sql
select ((select auth.uid()) = '3c298159-e7d1-4507-ad06-b44765968162'::uuid) as is_admin;
```

Run once with the admin claim and once with a known non-admin claim. Record the limitation explicitly.

- [ ] **Step 8: Confirm all test writes rolled back**

Re-run the complete row-count query from Task 1.

Expected: exact equality with pre-migration counts.

Also explicitly verify any synthetic UUIDs used during tests are absent after rollback.

---

### Task 5: Verify advisors and production invariants

**Files:**
- No repository write in this task; results feed Task 6 report.

**Interfaces:**
- Consumes: live migrated/tested state.
- Produces: advisor evidence and final DB invariant evidence.

- [ ] **Step 1: Fetch Performance Advisor**

Expected P1B.1 results:

```text
0 targeted public auth_rls_initplan findings
0 targeted five unindexed_foreign_keys findings
4 realtime auth_rls_initplan findings may remain
legacy KV duplicate_index warning may remain
unused_index INFO findings may remain
```

If any targeted public RLS or target-FK finding remains, P1B.1 is not green.

- [ ] **Step 2: Fetch Security Advisor**

Compare with Task 1 baseline.

Expected: no new warning/error introduced by P1B.1. Existing intentional server-only INFO items and unrelated leaked-password warning may remain.

- [ ] **Step 3: Verify Realtime and Storage policies were not modified**

Capture current `pg_policies` rows for `realtime.messages` and `storage.objects` and compare names/commands/roles/expressions with the pre-P1B.1 architecture snapshot if available.

At minimum verify:

```text
realtime direct-auth policy count remains 4
P1B.1 migration source contains no "realtime." or "storage." ALTER POLICY
```

- [ ] **Step 4: Verify final row counts again**

Run the Task 1 count query once more after all advisor checks.

Expected: exact pre-P1B.1 values.

---

### Task 6: Document verification, run repository gates, and open draft PR

**Files:**
- Create: `docs/superpowers/reports/2026-08-22-p1b1-public-rls-fk-indexes-report.md`
- Optional modify: none.

**Interfaces:**
- Consumes: all evidence from Tasks 1-5.
- Produces: auditable implementation report and draft PR ready for human smoke testing.

- [ ] **Step 1: Write the implementation report**

The report must contain exact observed values for:

```text
branch/base/commits
migration name
RED 47/4 policy counts
full target policy list
before/after advisor counts
five FK names and five added index definitions
owner/member/outsider relationship-selection method
read/write equivalence outcomes
row counts before/after
synthetic-row cleanup checks
Realtime/Storage/KV/unused-index exclusions
Security Advisor before/after
rollback instructions
```

Rollback section must restore the exact Task 1 policy expressions with `ALTER POLICY` and drop only:

```sql
drop index public.idx_characters_portrait_asset;
drop index public.idx_entity_notes_campaign;
drop index public.idx_monsters_portrait_asset;
drop index public.idx_news_posts_author;
drop index public.idx_npcs_portrait_asset;
```

Do not publish or reproduce secrets/tokens/keys in the report.

- [ ] **Step 2: Commit the report**

```bash
git add docs/superpowers/reports/2026-08-22-p1b1-public-rls-fk-indexes-report.md
git commit -m "docs: record P1B.1 RLS and index verification"
```

- [ ] **Step 3: Review complete diff against `main`**

Expected changed-file set:

```text
docs/superpowers/specs/2026-08-22-p1b1-public-rls-fk-indexes-design.md
docs/superpowers/plans/2026-08-22-p1b1-public-rls-fk-indexes.md
supabase-p1b1-public-rls-fk-indexes.sql
docs/superpowers/reports/2026-08-22-p1b1-public-rls-fk-indexes-report.md
```

An additional durable verification script is allowed only if evidence shows it materially protects this contract; application code changes are not allowed under the approved P1B.1 scope.

- [ ] **Step 4: Run repository verification**

Run the existing clean CI path:

```bash
npm ci
npm run check
```

Expected: success for typecheck, canonical campaign regression gate, and production build.

- [ ] **Step 5: Open a draft PR against `main`**

Title:

```text
P1B.1 performance — public RLS init-plans and FK indexes
```

PR body must summarize:

```text
47 public RLS policies optimized with semantic-equivalence testing
5 FK indexes added
Realtime/Storage/KV/unused indexes untouched
advisor before/after results
data invariants
CI/Vercel results
manual authenticated smoke gate before merge
```

Keep PR draft. Do not merge.

- [ ] **Step 6: Verify GitHub Actions and Vercel on final PR SHA**

Expected:

```text
CI npm ci = success
CI npm run check = success
Vercel = success
```

- [ ] **Step 7: Request authenticated Hollowgate smoke test**

Smoke should cover at least:

```text
owned campaign open/read
joined campaign open/read
PG read/save
PNG/monster visibility as GM/player
adventure/environment/folder flows
profile/settings/notifications access
one representative create/update/delete flow with rollback/disposable data where practical
```

Merge only after the user reports success and explicitly approves merge.
