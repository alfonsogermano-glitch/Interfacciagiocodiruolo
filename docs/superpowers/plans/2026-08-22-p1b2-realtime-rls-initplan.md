# P1B.2 Realtime RLS init-plan Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the four remaining Supabase Realtime RLS init-plan warnings without changing Hollowgate private-channel authorization semantics.

**Architecture:** Apply a policy-only, semantics-preserving transformation to exactly four `realtime.messages` policies. Replace direct request-context helper calls with scalar subqueries while preserving topic guards, UUID regex/casts, ownership/membership checks, policy names, roles, commands, and the two existing `online:all` policies. Verify behavior with transaction-local JWT/topic context before and after the migration, then run advisors and repository gates.

**Tech Stack:** PostgreSQL / Supabase Realtime RLS, Supabase migration tooling, React/Vite repository regression gates, GitHub Actions, Vercel.

**Spec:** `docs/superpowers/specs/2026-08-22-p1b2-realtime-rls-initplan-design.md`

## Global Constraints

- Modify exactly four existing policies on `realtime.messages`.
- Do not add, remove, merge, rename, broaden, or narrow policies.
- Preserve policy roles (`authenticated`) and commands (`SELECT`/`INSERT`).
- Preserve campaign topic prefix, UUID regex guard, cast placement, owner/member checks, and logical OR semantics.
- Preserve the two `online:all` policies byte-for-byte in effective definition.
- Do not add or remove `extension` predicates in target policies.
- Do not modify frontend, Edge Functions, public-schema RLS, Realtime tables/functions/triggers, or legacy SQL history.
- All preflight behavior tests must be read-only or transactionally rolled back.
- Merge only after CI/Vercel and user-authenticated Realtime smoke test are green and the user explicitly authorizes merge.

---

## File Structure

- Create: `supabase-p1b2-realtime-rls-initplan.sql` — the only operational migration source.
- Create: `docs/superpowers/reports/2026-08-22-p1b2-realtime-rls-initplan-report.md` — implementation evidence and rollback notes.
- Modify no application source files.

---

### Task 1: Capture RED structural baseline and test identities

**Files:**
- No repository file changes.

**Interfaces:**
- Consumes: production `pg_policies`, `campaigns`, `campaign_members`, `profiles`.
- Produces: exact pre-migration policy snapshot plus owner/member/outsider IDs for behavior probes.

- [ ] **Step 1: Snapshot all six Realtime policies**

Run:

```sql
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'realtime' and tablename = 'messages'
order by policyname;
```

Expected: exactly six rows, including the four targets and two `online:all` policies.

- [ ] **Step 2: Count direct helper calls in the four target policies**

Run:

```sql
with p as (
  select policyname, coalesce(qual, '') || ' ' || coalesce(with_check, '') as expr
  from pg_policies
  where schemaname = 'realtime'
    and tablename = 'messages'
    and policyname in (
      'authenticated can listen to own profile channel',
      'campaign_presence_member_write',
      'campaign_presence_owner_write',
      'characters_broadcast_select'
    )
)
select
  count(*) as target_policy_count,
  sum(
    regexp_count(expr, 'auth\\.uid\\(\\)')
    - regexp_count(expr, 'SELECT auth\\.uid\\(\\)')
  ) as direct_auth_uid_calls,
  sum(
    regexp_count(expr, 'realtime\\.topic\\(\\)')
    - regexp_count(expr, 'SELECT realtime\\.topic\\(\\)')
  ) as direct_topic_calls
from p;
```

Expected RED: `target_policy_count = 4`, with both direct-call totals greater than zero.

- [ ] **Step 3: Resolve one owner/member/outsider test set dynamically**

Run:

```sql
with candidate as (
  select c.id as campaign_id,
         c.owner_profile_id as owner_id,
         cm.profile_id as member_id
  from campaigns c
  join campaign_members cm
    on cm.campaign_id = c.id
   and cm.profile_id <> c.owner_profile_id
  where c.deleted_at is null
  limit 1
), outsider as (
  select p.id as outsider_id
  from profiles p, candidate c
  where p.id <> c.owner_id
    and p.id <> c.member_id
    and not exists (
      select 1
      from campaign_members cm
      where cm.campaign_id = c.campaign_id
        and cm.profile_id = p.id
    )
  limit 1
)
select * from candidate cross join outsider;
```

Expected: one campaign with non-owner member and one unrelated profile. If no row exists, use separate existing campaigns/profiles while preserving the same three roles; do not create persistent identities.

---

### Task 2: Establish RED authorization matrix

**Files:**
- No repository file changes.

**Interfaces:**
- Consumes: IDs from Task 1.
- Produces: baseline booleans for campaign/profile topics and malformed topics.

- [ ] **Step 1: Evaluate campaign owner/member/outsider behavior using transaction-local JWT and topic settings**

For each identity, run inside a transaction:

```sql
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<PROFILE_ID>', 'role', 'authenticated')::text, true);
select set_config('realtime.topic', 'campaign:<CAMPAIGN_UUID>', true);

select
  auth.uid()::text as uid,
  realtime.topic() as topic,
  (
    realtime.topic() like 'campaign:%'
    and split_part(realtime.topic(), ':', 2) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and exists (
      select 1 from campaigns
      where campaigns.id = split_part(realtime.topic(), ':', 2)::uuid
        and campaigns.owner_profile_id = auth.uid()::text
    )
  ) as owner_write,
  (
    realtime.topic() like 'campaign:%'
    and split_part(realtime.topic(), ':', 2) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and exists (
      select 1 from campaign_members
      where campaign_members.campaign_id = split_part(realtime.topic(), ':', 2)::uuid
        and campaign_members.profile_id = auth.uid()::text
    )
  ) as member_write,
  (
    realtime.topic() like 'campaign:%'
    and split_part(realtime.topic(), ':', 2) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and (
      exists (
        select 1 from campaigns
        where campaigns.id = split_part(realtime.topic(), ':', 2)::uuid
          and campaigns.owner_profile_id = auth.uid()::text
      )
      or exists (
        select 1 from campaign_members
        where campaign_members.campaign_id = split_part(realtime.topic(), ':', 2)::uuid
          and campaign_members.profile_id = auth.uid()::text
      )
    )
  ) as campaign_read;
rollback;
```

Expected:
- owner: owner path true, campaign read true;
- member: member path true, campaign read true;
- outsider: all false.

- [ ] **Step 2: Evaluate profile topic behavior**

```sql
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<PROFILE_ID>', 'role', 'authenticated')::text, true);
select set_config('realtime.topic', 'profile:<PROFILE_ID>', true);
select realtime.topic() like 'profile:%'
   and split_part(realtime.topic(), ':', 2) = auth.uid()::text as own_profile_allowed;
select set_config('realtime.topic', 'profile:<OTHER_PROFILE_ID>', true);
select realtime.topic() like 'profile:%'
   and split_part(realtime.topic(), ':', 2) = auth.uid()::text as other_profile_allowed;
rollback;
```

Expected: own profile `true`, other profile `false`.

- [ ] **Step 3: Verify malformed/non-campaign topics fail closed without cast errors**

Run with `realtime.topic` values `campaign:not-a-uuid`, `profile:anything`, and `online:all` against the three campaign expressions.

Expected: all campaign expressions return `false`; no UUID-cast exception occurs.

---

### Task 3: Create the migration source and verify it fails RED guards before application

**Files:**
- Create: `supabase-p1b2-realtime-rls-initplan.sql`

**Interfaces:**
- Consumes: exact RED policy definitions.
- Produces: four `ALTER POLICY` statements only.

- [ ] **Step 1: Write the migration**

Use exactly:

```sql
alter policy "authenticated can listen to own profile channel"
on realtime.messages
using (
  (select realtime.topic()) like 'profile:%'
  and split_part((select realtime.topic()), ':', 2) = (select auth.uid())::text
);

alter policy "campaign_presence_member_write"
on realtime.messages
with check (
  (select realtime.topic()) like 'campaign:%'
  and split_part((select realtime.topic()), ':', 2) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  and exists (
    select 1
    from campaign_members
    where campaign_members.campaign_id = split_part((select realtime.topic()), ':', 2)::uuid
      and campaign_members.profile_id = (select auth.uid())::text
  )
);

alter policy "campaign_presence_owner_write"
on realtime.messages
with check (
  (select realtime.topic()) like 'campaign:%'
  and split_part((select realtime.topic()), ':', 2) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  and exists (
    select 1
    from campaigns
    where campaigns.id = split_part((select realtime.topic()), ':', 2)::uuid
      and campaigns.owner_profile_id = (select auth.uid())::text
  )
);

alter policy "characters_broadcast_select"
on realtime.messages
using (
  (select realtime.topic()) like 'campaign:%'
  and split_part((select realtime.topic()), ':', 2) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  and (
    exists (
      select 1
      from campaigns
      where campaigns.id = split_part((select realtime.topic()), ':', 2)::uuid
        and campaigns.owner_profile_id = (select auth.uid())::text
    )
    or exists (
      select 1
      from campaign_members
      where campaign_members.campaign_id = split_part((select realtime.topic()), ':', 2)::uuid
        and campaign_members.profile_id = (select auth.uid())::text
    )
  )
);
```

- [ ] **Step 2: Commit the migration source before live DDL**

Commit message:

```text
db: optimize Realtime RLS init plans
```

Expected: branch contains spec, plan, and migration only.

---

### Task 4: Run rollback-only migration preflight

**Files:**
- No repository file changes.

**Interfaces:**
- Consumes: migration SQL from Task 3 and RED snapshots.
- Produces: proof the exact transformation is syntactically valid and behaviorally equivalent before live application.

- [ ] **Step 1: Begin transaction and execute the four ALTER POLICY statements**

Run the committed SQL between `BEGIN;` and verification queries, but do not commit.

- [ ] **Step 2: Verify structural GREEN inside the transaction**

Run the direct-call detector from Task 1.

Expected: `target_policy_count = 4`, `direct_auth_uid_calls = 0`, `direct_topic_calls = 0`.

Also verify:

```sql
select policyname, cmd, roles,
       coalesce(qual, '') || ' ' || coalesce(with_check, '') as expr
from pg_policies
where schemaname = 'realtime' and tablename = 'messages'
order by policyname;
```

Expected:
- six policies still present;
- same commands and roles;
- both `online:all` definitions unchanged;
- three campaign policies still contain the UUID regex;
- none of the four target policies contains an `extension` predicate.

- [ ] **Step 3: Re-run the complete Task 2 authorization matrix inside the same transaction**

Expected: every boolean exactly matches RED.

- [ ] **Step 4: Roll back and verify RED is restored exactly**

```sql
rollback;
```

Re-run policy snapshot/direct-call detector.

Expected: original four direct-call policies restored; no persistent change.

---

### Task 5: Apply live migration and verify GREEN

**Files:**
- No repository file changes.

**Interfaces:**
- Consumes: committed migration source validated in Task 4.
- Produces: production policy optimization.

- [ ] **Step 1: Apply migration through Supabase migration tooling**

Migration name:

```text
p1b2_realtime_rls_initplan
```

Migration body: exactly the four `ALTER POLICY` statements from `supabase-p1b2-realtime-rls-initplan.sql`.

- [ ] **Step 2: Verify structural GREEN immediately**

Expected:
- exactly six policies;
- target count four;
- direct auth/topic calls zero in targets;
- both `online:all` definitions unchanged;
- commands/roles unchanged;
- UUID guards present;
- no extension predicates added.

- [ ] **Step 3: Re-run Task 2 matrix against live definitions**

Expected: byte-for-byte equivalent boolean outcomes to RED.

- [ ] **Step 4: Verify database entity counts are unchanged**

Run counts for the same production entity tables used in P1B.1 (`characters`, `npcs`, `monsters`, `adventures`, `environments`, `clues`, `situations`, `entity_notes`, `folders`, `visual_assets`, `notifications`, `profiles`, `campaigns`, `campaign_members`).

Expected: no count changes attributable to the migration.

---

### Task 6: Run Supabase advisors and regression checks

**Files:**
- No repository file changes.

**Interfaces:**
- Consumes: live GREEN state.
- Produces: advisor evidence for report.

- [ ] **Step 1: Run Performance Advisor**

Expected:
- the four P1B.2 Realtime `auth_rls_initplan` warnings are gone;
- P1B.1 public-schema init-plan and FK warnings remain resolved;
- unrelated unused-index and KV duplicate-index findings may remain.

- [ ] **Step 2: Run Security Advisor**

Expected: no new security warning caused by P1B.2. Existing intentional server-only RLS INFO and unrelated Auth settings may remain.

---

### Task 7: Write implementation report

**Files:**
- Create: `docs/superpowers/reports/2026-08-22-p1b2-realtime-rls-initplan-report.md`

**Interfaces:**
- Consumes: RED/GREEN snapshots, matrix results, advisor results.
- Produces: auditable P1B.2 completion evidence and rollback instructions.

- [ ] **Step 1: Record exact migration and verification results**

Include:
- branch/base SHA;
- four changed policy names;
- six-policy before/after invariant;
- RED/GREEN direct-call counts;
- owner/member/outsider/profile/malformed-topic matrix;
- confirmation `online:all` policies unchanged;
- advisor outcomes;
- database count invariants;
- explicit statement that no frontend/Edge/public RLS files changed.

- [ ] **Step 2: Record exact rollback**

Include the four pre-P1B.2 `ALTER POLICY` definitions captured in Task 1 so rollback is executable without reconstruction.

- [ ] **Step 3: Commit the report**

Commit message:

```text
docs: report P1B.2 verification
```

---

### Task 8: Repository gates and draft PR

**Files:**
- No additional source changes.

**Interfaces:**
- Consumes: final branch state.
- Produces: reviewable draft PR with CI/Vercel evidence.

- [ ] **Step 1: Compare branch against `main`**

Expected changed files only:
- P1B.2 spec;
- P1B.2 plan;
- migration SQL;
- P1B.2 report.

No application source file may appear.

- [ ] **Step 2: Open a draft PR against `main`**

Title:

```text
P1B.2: optimize Realtime RLS init plans
```

PR body must summarize scope, four policies, RED/GREEN matrix, advisor result, rollback, and smoke-test requirement.

- [ ] **Step 3: Wait for final branch CI**

Expected:
- `npm ci` success;
- `npm run check` success.

- [ ] **Step 4: Verify Vercel status on the final branch SHA**

Expected: success.

Do not merge.

---

### Task 9: User-authenticated Realtime smoke gate

**Files:**
- No repository changes unless a real defect is found.

**Interfaces:**
- Consumes: draft PR and live migrated policies.
- Produces: user acceptance or rollback/fix decision.

- [ ] **Step 1: Owner/member campaign channel test**

With two authenticated sessions on the same campaign, confirm both private channels reach `SUBSCRIBED` and remain stable after refresh/reconnect.

- [ ] **Step 2: Broadcast test**

Perform one normal campaign action that produces Realtime broadcast and verify it propagates to the other session.

- [ ] **Step 3: Presence test**

Confirm campaign presence sync/track/untrack operates without `CHANNEL_ERROR`.

- [ ] **Step 4: Profile notification test**

Trigger a normal notification/invite path and verify only the intended user's `profile:{userId}` private channel receives the update.

- [ ] **Step 5: Merge gate**

If smoke is green, request explicit user authorization before merging. If smoke fails, restore the four pre-P1B.2 policy expressions immediately and investigate on the branch.
