# P1B.2 Realtime RLS init-plan and Safe UUID Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the four remaining Realtime RLS init-plan warnings while preserving valid-topic authorization and fixing the confirmed UUID-cast error on malformed/non-campaign topics.

**Architecture:** Change exactly four `realtime.messages` policies. The profile policy receives only scalar-subquery init-plan optimization. The three campaign policies receive the same init-plan optimization plus a runtime `CASE` guard so the UUID cast is evaluated only for a valid `campaign:{uuid}` topic. No frontend, Edge Function, public RLS, Realtime schema object, or `online:all` policy changes.

**Tech Stack:** PostgreSQL / Supabase Realtime RLS, Supabase migration tooling, React/Vite regression gates, GitHub Actions, Vercel.

**Spec:** `docs/superpowers/specs/2026-08-22-p1b2-realtime-rls-initplan-design.md`

## Global Constraints

- Modify exactly four existing policies on `realtime.messages`.
- Do not add, remove, merge, rename, broaden, or narrow policy behavior for valid topics.
- Preserve roles (`authenticated`) and commands (`SELECT`/`INSERT`).
- Preserve topic prefixes, UUID regex, owner/member checks, and logical OR semantics.
- Protect every campaign UUID cast with a runtime `CASE` branch.
- Preserve both `online:all` policies unchanged.
- Do not add/remove `extension` predicates.
- Do not modify frontend, Edge Functions, public-schema RLS, Realtime tables/functions/triggers, or legacy SQL history.
- All preflight changes must be rolled back.
- Merge only after CI/Vercel, user smoke test, and explicit user authorization.

---

## File Structure

- Modify: `docs/superpowers/specs/2026-08-22-p1b2-realtime-rls-initplan-design.md` — revised approved design.
- Modify: `docs/superpowers/plans/2026-08-22-p1b2-realtime-rls-initplan.md` — this plan.
- Create: `supabase-p1b2-realtime-rls-initplan.sql` — only operational migration source.
- Create: `docs/superpowers/reports/2026-08-22-p1b2-realtime-rls-initplan-report.md` — evidence and rollback notes.
- Modify no application source files.

---

### Task 1: Re-establish RED baseline

**Files:** none.

**Interfaces:**
- Consumes: production `pg_policies`, `campaigns`, `campaign_members`, `profiles`.
- Produces: exact policy snapshot and owner/member/outsider identities.

- [ ] **Step 1: Snapshot six Realtime policies**

```sql
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'realtime' and tablename = 'messages'
order by policyname;
```

Expected: exactly six rows.

- [ ] **Step 2: Confirm direct helper RED**

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
select count(*) as target_policy_count,
       sum(regexp_count(expr, 'auth\\.uid\\(\\)') - regexp_count(expr, 'SELECT auth\\.uid\\(\\)')) as direct_auth_uid_calls,
       sum(regexp_count(expr, 'realtime\\.topic\\(\\)') - regexp_count(expr, 'SELECT realtime\\.topic\\(\\)')) as direct_topic_calls
from p;
```

Expected RED already observed: `4`, `5`, `12`.

- [ ] **Step 3: Resolve owner/member/outsider dynamically**

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
  select p.id::text as outsider_id
  from profiles p, candidate c
  where p.id::text <> c.owner_id
    and p.id::text <> c.member_id
    and not exists (
      select 1 from campaign_members cm
      where cm.campaign_id = c.campaign_id
        and cm.profile_id = p.id::text
    )
  limit 1
)
select * from candidate cross join outsider;
```

Expected: one row. Do not create identities.

---

### Task 2: Capture RED behavior including the confirmed bug

**Files:** none.

**Interfaces:**
- Consumes: IDs from Task 1.
- Produces: valid-topic authorization matrix plus malformed-topic failure evidence.

- [ ] **Step 1: Valid campaign matrix**

For each identity, set transaction-local JWT/topic context and evaluate the current owner/member/read predicates.

Expected baseline already observed:

| Identity | owner_write | member_write | campaign_read |
|---|---:|---:|---:|
| owner | true | false | true |
| member | false | true | true |
| outsider | false | false | false |

- [ ] **Step 2: Profile matrix**

Set `request.jwt.claims` for one existing profile.

Expected:
- own `profile:{id}` -> `true`;
- another `profile:{id}` -> `false`.

- [ ] **Step 3: Reproduce malformed-topic RED**

Evaluate current campaign-policy logic using:

```text
campaign:not-a-uuid
online:all
```

Expected RED: `22P02 invalid input syntax for type uuid`.

This failure is required before implementation; a pre-migration result of `false` would mean the production state changed and the plan must stop for review.

---

### Task 3: Create the migration source

**Files:**
- Create: `supabase-p1b2-realtime-rls-initplan.sql`

**Interfaces:**
- Produces: four explicit `ALTER POLICY` statements.

- [ ] **Step 1: Write profile policy optimization**

```sql
alter policy "authenticated can listen to own profile channel"
on realtime.messages
using (
  (select realtime.topic()) like 'profile:%'
  and split_part((select realtime.topic()), ':', 2) = (select auth.uid())::text
);
```

- [ ] **Step 2: Write member policy with safe `CASE`**

```sql
alter policy "campaign_presence_member_write"
on realtime.messages
with check (
  case
    when (select realtime.topic()) like 'campaign:%'
     and split_part((select realtime.topic()), ':', 2) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then exists (
      select 1
      from campaign_members
      where campaign_members.campaign_id = split_part((select realtime.topic()), ':', 2)::uuid
        and campaign_members.profile_id = (select auth.uid())::text
    )
    else false
  end
);
```

- [ ] **Step 3: Write owner policy with safe `CASE`**

```sql
alter policy "campaign_presence_owner_write"
on realtime.messages
with check (
  case
    when (select realtime.topic()) like 'campaign:%'
     and split_part((select realtime.topic()), ':', 2) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then exists (
      select 1
      from campaigns
      where campaigns.id = split_part((select realtime.topic()), ':', 2)::uuid
        and campaigns.owner_profile_id = (select auth.uid())::text
    )
    else false
  end
);
```

- [ ] **Step 4: Write read/broadcast policy with one outer safe `CASE`**

```sql
alter policy "characters_broadcast_select"
on realtime.messages
using (
  case
    when (select realtime.topic()) like 'campaign:%'
     and split_part((select realtime.topic()), ':', 2) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then (
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
    else false
  end
);
```

- [ ] **Step 5: Commit migration before live DDL**

Commit message:

```text
db: harden Realtime topic policies
```

Expected branch files: revised spec, revised plan, migration; no app source.

---

### Task 4: Rollback-only preflight

**Files:** none.

**Interfaces:**
- Consumes: committed migration.
- Produces: proof of syntax, structure, valid-topic equivalence, and malformed-topic fix.

- [ ] **Step 1: Begin transaction and execute the exact four `ALTER POLICY` statements**

Do not commit.

- [ ] **Step 2: Verify structural GREEN inside transaction**

Expected:
- six total policies;
- four targets;
- direct `auth.uid()` = 0;
- direct `realtime.topic()` = 0;
- same names/roles/commands;
- two `online:all` definitions unchanged;
- three campaign policies contain UUID regex and `CASE`;
- target policies contain no `extension` predicate.

- [ ] **Step 3: Re-run valid-topic matrix**

Expected exactly:

| Identity | owner_write | member_write | campaign_read |
|---|---:|---:|---:|
| owner | true | false | true |
| member | false | true | true |
| outsider | false | false | false |

Profile own/other remains `true/false`.

- [ ] **Step 4: Verify malformed-topic GREEN**

Evaluate the new policy expressions with:

```text
campaign:not-a-uuid
online:all
profile:anything
anything:else
```

Expected for all campaign policies: `false`; no `22P02` or other cast error.

- [ ] **Step 5: Roll back and verify RED restoration**

After `ROLLBACK`, helper counts return to `4/5/12`, and malformed `campaign:not-a-uuid` again reproduces `22P02`.

Only after this exact cycle passes may live DDL proceed.

---

### Task 5: Apply live migration and verify GREEN

**Files:** none.

**Interfaces:**
- Consumes: committed/preflighted migration.
- Produces: production policy optimization and safe topic handling.

- [ ] **Step 1: Apply through Supabase migration tooling**

Migration name:

```text
p1b2_realtime_rls_initplan_safe_uuid
```

Body: exactly `supabase-p1b2-realtime-rls-initplan.sql`.

- [ ] **Step 2: Verify structural GREEN immediately**

Expected:
- six policies;
- direct helper calls zero in four targets;
- `online:all` policies unchanged;
- roles/commands unchanged;
- safe `CASE` present in three campaign policies;
- no extension changes.

- [ ] **Step 3: Re-run valid-topic authorization matrix**

Expected identical to Task 2.

- [ ] **Step 4: Re-run malformed-topic matrix**

Expected `false` without exceptions.

- [ ] **Step 5: Verify data invariants**

Count:

`characters`, `npcs`, `monsters`, `adventures`, `environments`, `clues`, `situations`, `entity_notes`, `folders`, `visual_assets`, `notifications`, `profiles`, `campaigns`, `campaign_members`.

Expected: unchanged from immediate pre-migration baseline.

---

### Task 6: Advisors

**Files:** none.

- [ ] **Step 1: Performance Advisor**

Expected:
- four P1B.2 Realtime `auth_rls_initplan` warnings gone;
- P1B.1 public init-plan/FK fixes remain resolved;
- unrelated unused/KV findings may remain.

- [ ] **Step 2: Security Advisor**

Expected: no new P1B.2 security warning.

---

### Task 7: Implementation report

**Files:**
- Create: `docs/superpowers/reports/2026-08-22-p1b2-realtime-rls-initplan-report.md`

- [ ] **Step 1: Record evidence**

Include:
- base/branch/final SHA;
- original spec assumption invalidated by RED;
- exact `22P02` reproduction;
- four changed policies;
- helper counts `4/5/12 -> 4/0/0`;
- valid-topic matrix before/after;
- malformed-topic `22P02 -> false` result;
- unchanged `online:all` policies;
- entity counts;
- advisor results;
- rollback SQL/source.

- [ ] **Step 2: Commit report**

Commit message:

```text
docs: report P1B.2 Realtime hardening verification
```

---

### Task 8: Repository gates and draft PR

**Files:** none beyond already committed artifacts.

- [ ] **Step 1: Compare branch against `main`**

Expected changed files only:
- revised spec;
- revised plan;
- migration SQL;
- implementation report.

No application source files.

- [ ] **Step 2: Open draft PR**

Title:

```text
P1B.2: optimize and harden Realtime RLS policies
```

- [ ] **Step 3: Verify branch CI**

Expected:
- `npm ci` success;
- `npm run check` success.

- [ ] **Step 4: Verify Vercel**

Expected final branch SHA deployment success.

---

### Task 9: User smoke gate

Before merge, ask the user to verify:

1. owner and member can subscribe to the same campaign;
2. campaign Broadcast propagates between sessions;
3. campaign Presence syncs without `CHANNEL_ERROR`;
4. refresh/reconnect works;
5. outsider cannot access unrelated campaign;
6. profile notification channel subscribes;
7. a real invite/notification reaches only the intended user.

Do not merge until the user reports success and explicitly authorizes merge.
