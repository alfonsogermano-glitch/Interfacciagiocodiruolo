# P1B.2 — Realtime RLS init-plan optimization

Date: 2026-08-22
Status: Approved design, implementation not started
Base: `main` at `64bb1c773387b931720644cc7a550db20634c6eb`
Branch: `hardening/p1b2-realtime-rls-initplan`

## Goal

Eliminate the remaining Supabase Realtime RLS init-plan performance warnings without changing the effective authorization model of Hollowgate private Realtime channels.

This phase is deliberately narrow: it optimizes the four existing `realtime.messages` policies that still call `auth.uid()` and/or `realtime.topic()` directly. It does not redesign channel authorization, enable global presence, change frontend Realtime code, or alter public-schema RLS.

## Current state

Production currently has six policies on `realtime.messages`:

1. `authenticated can listen to online:all` — SELECT — already uses `(select realtime.topic())`.
2. `authenticated can track online:all` — INSERT — already uses `(select realtime.topic())`.
3. `authenticated can listen to own profile channel` — SELECT — still directly evaluates `realtime.topic()` and `auth.uid()`.
4. `campaign_presence_member_write` — INSERT — still directly evaluates `realtime.topic()` and `auth.uid()` inside membership authorization.
5. `campaign_presence_owner_write` — INSERT — still directly evaluates `realtime.topic()` and `auth.uid()` inside owner authorization.
6. `characters_broadcast_select` — SELECT — still directly evaluates `realtime.topic()` and `auth.uid()` inside owner/member authorization.

The global `online:all` client path is intentionally disabled in `PresenceContext.tsx`; those two policies remain untouched in P1B.2.

The active application paths are:

- `campaign:{campaignId}` private channels through `src/services/realtime/campaignChannel.ts` for Broadcast and Presence.
- `profile:{userId}` private channel in `src/app/notifications/NotificationsContext.tsx` for notification Broadcast.

## Current Supabase behavior and compatibility constraints

Supabase Realtime Authorization evaluates RLS policies on `realtime.messages` when a private Channel topic is joined. Current Supabase documentation recommends the scalar-subquery form `(select auth.uid())` and `(select realtime.topic())` in authorization policies, and notes that authorization complexity affects connection latency.

A July 14, 2026 Supabase breaking change fully locked down arbitrary modification of the `realtime` schema, while explicitly preserving management of RLS policies on `realtime.messages`. P1B.2 therefore modifies policies only; it does not alter Realtime tables, functions, triggers, or schema objects.

Current Supabase documentation also supports optional checks on `realtime.messages.extension` for Broadcast and Presence. Hollowgate will not introduce or remove extension checks in this phase. Existing production behavior is the compatibility baseline, and prior project diagnostics showed private-channel authorization sensitivity around extension-specific policies. Adding extension filtering would therefore be a semantic/security redesign, not an init-plan optimization.

## Chosen approach

Use a mechanical, semantics-preserving transformation of exactly four policies:

- direct `auth.uid()` -> `(select auth.uid())`
- direct `realtime.topic()` -> `(select realtime.topic())`

Everything else is preserved:

- policy names;
- target table `realtime.messages`;
- `PERMISSIVE` behavior;
- role `authenticated`;
- command (`SELECT` or `INSERT`);
- topic prefixes;
- `split_part` structure;
- UUID regular-expression guard;
- UUID cast placement;
- owner lookup against `campaigns`;
- membership lookup against `campaign_members`;
- logical OR between owner/member branches;
- absence of extension predicates in the four target policies.

No policy is added, removed, merged, renamed, or broadened.

## Policies in scope

### 1. Profile notification read policy

`authenticated can listen to own profile channel`

Required authorization remains:

- topic starts with `profile:`;
- the second topic segment equals the authenticated user's UUID as text.

Only repeated request-context function evaluation changes to init-plan form.

### 2. Campaign member write policy

`campaign_presence_member_write`

Required authorization remains:

- topic starts with `campaign:`;
- the campaign segment passes the existing UUID regex before casting;
- an existing `campaign_members` row links that campaign to the authenticated profile.

The UUID guard must remain before the cast to preserve the prior protection against malformed/non-campaign topics causing cast errors in PERMISSIVE policy evaluation.

### 3. Campaign owner write policy

`campaign_presence_owner_write`

Required authorization remains:

- topic starts with `campaign:`;
- UUID format guard passes;
- the requested campaign exists and `owner_profile_id` equals the authenticated profile.

### 4. Campaign read/broadcast policy

`characters_broadcast_select`

Required authorization remains:

- topic starts with `campaign:`;
- UUID format guard passes;
- authenticated profile is either campaign owner OR campaign member.

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
- delete any legacy Realtime SQL history files.

## Migration artifact

Implementation will add one repository migration source file:

`supabase-p1b2-realtime-rls-initplan.sql`

The migration will use `ALTER POLICY` statements only. It will be designed for execution through Supabase migration tooling after a rollback-only preflight.

Because the Realtime schema is now protected by Supabase, successful `ALTER POLICY` is itself part of the compatibility gate; any attempt to alter other Realtime schema objects is prohibited.

## Verification strategy

### 1. Structural RED baseline

Before migration, record:

- all six `realtime.messages` policy definitions;
- exact names, roles and commands;
- count of the four target policies containing direct request-context calls;
- count of the two `online:all` policies and their exact definitions;
- security/performance advisor findings relevant to Realtime.

The expected RED state is four target policies still requiring optimization.

### 2. Authorization behavior baseline

Use transaction-local request context to exercise the policy predicates without persistent data changes. `realtime.topic()` reads the transaction/session setting `realtime.topic`, and authenticated identity will be simulated using the same JWT/session setting mechanism used by PostgreSQL auth helpers.

Representative existing production rows will be selected without mutation for:

- one campaign owner;
- one campaign member where available;
- one authenticated outsider profile.

The baseline matrix must distinguish:

- campaign owner on own campaign topic: allowed by owner/read paths;
- campaign member on joined campaign topic: allowed by member/read paths;
- outsider on campaign topic: denied;
- authenticated user on own `profile:{id}` topic: allowed read;
- authenticated user on another profile topic: denied;
- malformed `campaign:` topic: denied without UUID cast error;
- non-campaign topic: campaign policies evaluate false without error.

All behavior probes are read-only or rollback-only.

### 3. Migration preflight

Run the exact migration logic in a transaction and roll it back.

Inside the transaction verify:

- exactly four target policies are transformed;
- all four use scalar-subquery init-plan forms for request-context helpers;
- all six policy names remain present;
- policy commands and roles remain unchanged;
- both `online:all` policy definitions remain unchanged;
- UUID regex guards remain present on all three `campaign:{uuid}` policies;
- no extension predicate is introduced;
- the authorization matrix remains identical to RED.

After `ROLLBACK`, production definitions must return exactly to the RED baseline.

### 4. Live migration GREEN

Apply the committed migration through Supabase migration tooling.

Immediately verify:

- four target policies are in optimized form;
- zero direct `auth.uid()` calls remain in those four policies;
- zero direct `realtime.topic()` calls remain in those four policies where the helper is used;
- all six policies still exist with the same names/roles/commands;
- the two `online:all` policies are unchanged;
- the authorization matrix is identical to RED;
- database entity counts are unchanged;
- no unrelated schema objects changed.

### 5. Advisors

Run Supabase advisors after migration.

Success criterion for this phase:

- Realtime `auth_rls_initplan` warnings targeted by P1B.2 are eliminated;
- no new Security Advisor warning is introduced;
- public-schema P1B.1 results remain green;
- unrelated unused-index/info warnings are not treated as P1B.2 regressions.

### 6. Repository gates

Before user smoke test:

- migration source committed on the P1B.2 branch;
- implementation report committed;
- diff against `main` reviewed for scope;
- `npm ci` passes;
- `npm run check` passes;
- Vercel deployment for final branch SHA succeeds;
- PR remains draft and unmerged.

No application-code modification is expected; repository CI remains a regression gate rather than the primary proof of the database behavior.

### 7. Authenticated manual smoke

Before merge, user performs live authenticated testing with two sessions/accounts where possible:

1. Owner opens a campaign and a member opens the same campaign.
2. Campaign channel reaches `SUBSCRIBED` for both.
3. A campaign Broadcast-triggering action propagates between sessions.
4. Campaign Presence can track/untrack and sync without `CHANNEL_ERROR`.
5. Owner/member authorization still works after refresh/reconnect.
6. An outsider cannot use a campaign they do not own/join.
7. Profile notification channel subscribes for the logged-in user.
8. A real notification/invite path updates the intended recipient and not another user.

If a practical notification-producing action would create disposable data, that data may be removed normally after the smoke test.

## Rollback

Rollback is a policy-only reverse migration restoring the four exact pre-P1B.2 policy expressions captured in the RED baseline.

Rollback does not require data restoration because the migration changes no data.

If Realtime joins, broadcasts, presence, or profile notifications regress after live migration, the four prior policy expressions are restored before further investigation.

## Acceptance criteria

P1B.2 is complete only when all of the following are true:

1. Exactly the four intended Realtime policies were optimized.
2. Effective owner/member/outsider/profile authorization is unchanged.
3. Malformed/non-campaign topic safety is preserved.
4. The two `online:all` policies are unchanged.
5. No extension filtering was added or removed.
6. Target Realtime init-plan advisor warnings are gone.
7. No unrelated database data/schema change occurred.
8. Repository CI and Vercel are green on the final branch SHA.
9. User-authenticated Realtime smoke test passes.
10. Merge occurs only after explicit user approval.
