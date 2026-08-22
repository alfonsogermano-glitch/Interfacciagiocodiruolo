# P1B.2 — Realtime RLS init-plan optimization and safe campaign topic guard

Date: 2026-08-22
Status: Revised design approved after RED discovery; implementation in progress
Base: `main` at `64bb1c773387b931720644cc7a550db20634c6eb`
Branch: `hardening/p1b2-realtime-rls-initplan`

## Goal

Eliminate the remaining Supabase Realtime RLS init-plan performance warnings while preserving Hollowgate private-channel authorization for valid topics and fixing a confirmed fail-open-by-error condition for malformed/non-campaign topics.

This phase remains deliberately narrow. It changes exactly four existing `realtime.messages` policies, does not redesign channel ownership/membership rules, does not enable global presence, does not change frontend Realtime code, and does not alter public-schema RLS.

## Current state

Production has six policies on `realtime.messages`:

1. `authenticated can listen to online:all` — SELECT — already uses `(select realtime.topic())`.
2. `authenticated can track online:all` — INSERT — already uses `(select realtime.topic())`.
3. `authenticated can listen to own profile channel` — SELECT — still directly evaluates `realtime.topic()` and `auth.uid()`.
4. `campaign_presence_member_write` — INSERT — still directly evaluates `realtime.topic()` and `auth.uid()`.
5. `campaign_presence_owner_write` — INSERT — still directly evaluates `realtime.topic()` and `auth.uid()`.
6. `characters_broadcast_select` — SELECT — still directly evaluates `realtime.topic()` and `auth.uid()`.

The global `online:all` client path is intentionally disabled in `PresenceContext.tsx`; both `online:all` policies remain untouched in P1B.2.

Active application paths are:

- `campaign:{campaignId}` private channels through `src/services/realtime/campaignChannel.ts` for Broadcast and Presence.
- `profile:{userId}` private channel in `src/app/notifications/NotificationsContext.tsx` for notification Broadcast.

## RED discovery that revised the design

The original design assumed the existing expression order:

```sql
realtime.topic() like 'campaign:%'
and split_part(realtime.topic(), ':', 2) ~ '<uuid-regex>'
and exists (
  select 1
  from campaigns
  where campaigns.id = split_part(realtime.topic(), ':', 2)::uuid
)
```

would protect the UUID cast for malformed or unrelated topics.

A production RED probe disproved that assumption. With `realtime.topic = 'campaign:not-a-uuid'`, PostgreSQL raised:

```text
22P02: invalid input syntax for type uuid
```

The same failure occurred for `realtime.topic = 'online:all'`, where the second segment `all` was still evaluated by the UUID cast inside the `EXISTS` subquery.

Therefore SQL boolean term ordering is not a sufficient safety boundary here. PostgreSQL may plan/evaluate the subquery independently of the apparent left-to-right `AND` order.

This is a real correctness issue in the current production policies and may have contributed to historical `CHANNEL_ERROR` behavior for non-campaign private topics. P1B.2 does not claim it was the sole historical cause.

## Current Supabase behavior and compatibility constraints

Supabase Realtime Authorization evaluates RLS policies on `realtime.messages` when a private Channel topic is joined. Current Supabase guidance uses scalar subqueries such as `(select auth.uid())` and `(select realtime.topic())` to avoid repeated request-context helper evaluation.

Supabase protects the `realtime` schema from arbitrary modification while preserving management of RLS policies on `realtime.messages`. P1B.2 therefore modifies policies only; it does not alter Realtime tables, functions, triggers, or schema objects.

Hollowgate will not introduce or remove `realtime.messages.extension` predicates in this phase. Existing production channel behavior is the compatibility baseline, and previous project diagnostics showed private-channel authorization sensitivity around extension-specific policies.

## Chosen approach

### Profile policy

For `authenticated can listen to own profile channel`, perform only the init-plan transformation:

- direct `auth.uid()` -> `(select auth.uid())`
- direct `realtime.topic()` -> `(select realtime.topic())`

Authorization semantics stay exactly the same.

### Three campaign policies

For:

- `campaign_presence_member_write`
- `campaign_presence_owner_write`
- `characters_broadcast_select`

perform both:

1. scalar-subquery init-plan transformation for `auth.uid()` and `realtime.topic()`;
2. a runtime `CASE` guard that makes the UUID cast reachable only when the topic is a valid `campaign:{uuid}` topic.

Canonical structure:

```sql
case
  when (select realtime.topic()) like 'campaign:%'
   and split_part((select realtime.topic()), ':', 2) ~ '<uuid-regex>'
  then exists (
    select 1
    from ...
    where campaign_id = split_part((select realtime.topic()), ':', 2)::uuid
      and profile_id = (select auth.uid())::text
  )
  else false
end
```

For `characters_broadcast_select`, the owner/member OR remains inside the `THEN` branch of one outer `CASE`.

This preserves indexed UUID comparisons for valid campaign topics while guaranteeing malformed/non-campaign topics return `false` instead of attempting an invalid cast.

## Invariants that must remain unchanged

- policy names;
- table `realtime.messages`;
- `PERMISSIVE` behavior;
- role `authenticated`;
- command (`SELECT` or `INSERT`);
- `profile:` and `campaign:` topic prefixes;
- UUID regular expression;
- owner lookup against `campaigns`;
- membership lookup against `campaign_members`;
- owner/member OR semantics for `characters_broadcast_select`;
- absence of extension predicates in the four target policies;
- both `online:all` policies.

No policy is added, removed, merged, renamed, broadened, or narrowed for valid topics.

## Policies in scope

### 1. `authenticated can listen to own profile channel`

Required behavior:

- own `profile:{userId}` topic -> allowed;
- another profile topic -> denied.

Only init-plan form changes.

### 2. `campaign_presence_member_write`

Required behavior:

- valid campaign topic + existing membership -> allowed;
- valid campaign topic without membership -> denied;
- malformed/non-campaign topic -> `false`, never UUID-cast exception.

### 3. `campaign_presence_owner_write`

Required behavior:

- valid campaign topic + campaign owner -> allowed;
- valid campaign topic + non-owner -> denied;
- malformed/non-campaign topic -> `false`, never UUID-cast exception.

### 4. `characters_broadcast_select`

Required behavior:

- valid campaign topic + owner -> allowed;
- valid campaign topic + member -> allowed;
- outsider -> denied;
- malformed/non-campaign topic -> `false`, never UUID-cast exception.

## Explicitly out of scope

P1B.2 will not:

- change `src/services/realtime/campaignChannel.ts`;
- change `NotificationsContext.tsx`;
- re-enable `PresenceContext.tsx` global presence;
- alter either `online:all` policy;
- add `extension = 'broadcast'` or `extension = 'presence'` predicates;
- consolidate owner/member policies;
- change campaign membership semantics;
- change notification topic naming;
- modify `public` RLS policies;
- modify Edge Functions;
- create helper functions in the `realtime` schema;
- touch Realtime tables, triggers, or functions;
- delete legacy Realtime SQL history files.

## Migration artifact

Implementation adds one migration source file:

`supabase-p1b2-realtime-rls-initplan.sql`

The migration uses exactly four `ALTER POLICY` statements. It is applied through Supabase migration tooling only after a rollback-only preflight proves syntax, structural invariants, valid-topic authorization equivalence, and malformed-topic fail-closed behavior.

## Verification strategy

### 1. Structural RED baseline

Record:

- all six `realtime.messages` policy definitions;
- exact names, roles and commands;
- direct request-context helper counts in the four targets;
- exact definitions of the two `online:all` policies;
- relevant advisor findings.

Expected RED helper counts already observed:

- target policies: 4;
- direct `auth.uid()` calls: 5;
- direct `realtime.topic()` calls: 12.

### 2. Valid-topic authorization RED baseline

Use transaction-local request JWT/topic settings and existing production identities.

Observed baseline for one active campaign with owner/member/outsider:

| Identity | Owner write | Member write | Campaign read |
|---|---:|---:|---:|
| owner | true | false | true |
| member | false | true | true |
| outsider | false | false | false |

Profile baseline:

- own profile topic -> `true`;
- another profile topic -> `false`.

### 3. Malformed-topic RED baseline

The current three campaign policies are expected to reproduce the confirmed bug before migration:

- `campaign:not-a-uuid` -> UUID cast error `22P02`;
- `online:all` -> UUID cast error `22P02` when campaign policy expression is evaluated.

This is intentionally part of RED. GREEN changes this behavior from exception to `false`.

### 4. Migration preflight

Run the exact committed `ALTER POLICY` statements in a transaction.

Inside the transaction verify:

- exactly four target policies transformed;
- direct helper counts become zero;
- all six policy names remain present;
- commands and roles unchanged;
- both `online:all` definitions unchanged;
- all three campaign policies retain the UUID regex;
- all three campaign policies contain a `CASE` safe-cast boundary;
- no extension predicate introduced;
- valid-topic owner/member/outsider matrix matches RED exactly;
- own/other profile matrix matches RED exactly;
- `campaign:not-a-uuid`, `online:all`, `profile:anything`, and other non-campaign topics evaluate campaign policy logic to `false` without exception.

After `ROLLBACK`, the original RED definitions and malformed-topic error behavior must be restored.

### 5. Live migration GREEN

Apply the committed migration through Supabase migration tooling.

Immediately verify:

- exactly six policies still exist;
- four target policies optimized;
- zero direct `auth.uid()`/`realtime.topic()` calls remain in targets;
- both `online:all` policies unchanged;
- valid-topic authorization matrix unchanged;
- malformed/non-campaign topics fail closed with `false`, not SQL errors;
- database entity counts unchanged;
- no unrelated schema objects changed.

### 6. Advisors

Success criteria:

- the four P1B.2 Realtime `auth_rls_initplan` warnings are eliminated;
- P1B.1 public-schema RLS/FK improvements remain green;
- no new Security Advisor warning appears;
- unrelated unused-index/KV findings are not treated as P1B.2 regressions.

### 7. Repository gates

Before user smoke test:

- revised spec and plan committed;
- migration source committed before live DDL;
- implementation report committed;
- diff against `main` reviewed for scope;
- `npm ci` passes;
- `npm run check` passes;
- Vercel deployment for final branch SHA succeeds;
- PR remains draft and unmerged.

No application source modification is expected.

### 8. Authenticated manual smoke

Before merge, test with two sessions/accounts where possible:

1. Owner and member open the same campaign.
2. Campaign private channel reaches `SUBSCRIBED` for both.
3. A campaign Broadcast-triggering action propagates between sessions.
4. Campaign Presence tracks/untracks/syncs without `CHANNEL_ERROR`.
5. Owner/member behavior survives refresh/reconnect.
6. Outsider cannot use an unrelated campaign.
7. Profile notification channel subscribes for the logged-in user.
8. A real notification/invite updates the intended recipient only.

Optionally, if safe and convenient, verify that unrelated private topics no longer cause campaign-policy UUID errors. This is not a request to re-enable global presence.

## Rollback

Rollback restores the four exact pre-P1B.2 policy expressions captured in RED.

No data restoration is needed because the migration changes no data.

If valid Realtime joins, broadcasts, presence, or profile notifications regress after live migration, restore the prior four policy definitions before further investigation.

## Acceptance criteria

P1B.2 is complete only when all are true:

1. Exactly four intended policies changed.
2. Valid campaign/profile authorization remains unchanged.
3. Malformed/non-campaign topics return `false` instead of raising UUID cast errors.
4. The two `online:all` policies are unchanged.
5. No extension filtering was added or removed.
6. Target Realtime init-plan advisor warnings are gone.
7. No unrelated database data/schema change occurred.
8. Repository CI and Vercel are green on the final branch SHA.
9. User-authenticated Realtime smoke test passes.
10. Merge occurs only after explicit user approval.
