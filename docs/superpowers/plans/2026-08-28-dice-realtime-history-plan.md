# Dice Realtime and Session History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Plan 1 dice system so public rolls synchronize to all current campaign participants, secret rolls obey the exact player/GM visibility matrix, and every authorized client maintains only its own volatile history from join time onward.

**Architecture:** Reuse the existing ref-counted `campaignChannel.ts` for public campaign broadcasts, add a dedicated private `dice-gm:{campaignId}` topic for GM-only reception of secret player rolls, and route all local/remote results through the same `DiceSessionContext` ingestion API with id-based deduplication. Secret player sends use Supabase JS `channel.httpSend()` on a private channel so the sender needs write authorization but does not subscribe to/read that GM-only topic.

**Tech Stack:** React 18.3.1, TypeScript 5.7.3, Supabase JS 2.108.1, Supabase Realtime Broadcast private channels, PostgreSQL RLS on `realtime.messages`.

**Spec:** `docs/superpowers/specs/2026-08-28-dice-system-design.md`

**Depends on:** `docs/superpowers/plans/2026-08-28-dice-core-builder-plan.md`

## Global Constraints

- Public player roll -> all currently connected authorized campaign participants.
- Secret player roll -> roller + GM only.
- Public GM roll -> all currently connected authorized campaign participants.
- Secret GM roll -> GM only.
- Builder test `Roll` is always public.
- A late joiner sees no earlier history.
- `Clear` clears only the local client history and sends no Realtime event.
- Roll results remain non-persistent.
- Never broadcast a secret player payload on the normal `campaign:{id}` topic.
- Reuse the existing campaign channel registry; do not create a competing `supabase.channel('campaign:...')` lifecycle.
- Deduplicate all received results by `RollResult.id`.
- Realtime transport failure may report an error but must not mutate an already-generated local result into a different result.

---

## File Structure

Create:

- `src/services/realtime/diceRealtime.ts` — secret-send helper and payload validation/type guard.
- `supabase-dice-realtime-rls.sql` — GM-only read/member+GM write policies for `dice-gm:{uuid}`.
- `scripts/verify-dice-realtime.mjs` — static/source integration guard.

Modify:

- `src/services/realtime/campaignChannel.ts` — add `dice_roll` event to shared registry and export event type if useful.
- `src/app/components/session/dice/DiceSessionContext.tsx` — public/secret routing, remote ingestion, dedupe.
- `src/app/components/session/dice/DiceRollHistoryCard.tsx` — indicate secret roll visually only for authorized viewer.
- `src/app/components/session/dice/SessionDicePanel.tsx` — transport readiness/error feedback where needed.
- `package.json` — add Realtime verifier to `check`.

---

### Task 1: Add dice_roll to the shared campaign Realtime registry

**Files:**
- Modify: `src/services/realtime/campaignChannel.ts`
- Create: `scripts/verify-dice-realtime.mjs`

**Interfaces:**
- Produces `dice_roll` as a legal shared Broadcast event.
- Existing `useCampaignChannel(campaignId, { onBroadcast: { dice_roll }})` becomes available.

- [ ] **Step 1: Write RED static verifier**

Assert that `campaignChannel.ts` contains `dice_roll` in both the event union and known event array, while retaining all existing events:

```js
for (const event of ['INSERT','UPDATE','DELETE','session_change','members_change','notes_change','dice_roll']) {
  assert(source.includes(`'${event}'`));
}
```

Also assert the file still contains the module-level registry/refCount architecture so implementation does not bypass it.

- [ ] **Step 2: Run RED**

```bash
node scripts/verify-dice-realtime.mjs
```

Expected: failure because `dice_roll` is not yet registered.

- [ ] **Step 3: Add event**

Change:

```ts
type BroadcastEvent =
  | 'INSERT'
  | 'UPDATE'
  | 'DELETE'
  | 'session_change'
  | 'members_change'
  | 'notes_change'
  | 'dice_roll';
```

and include it in `KNOWN_BROADCAST_EVENTS`.

Do not alter existing retry/ref-count behavior.

- [ ] **Step 4: Run GREEN and existing checks**

```bash
node scripts/verify-dice-realtime.mjs
npm run typecheck
```

- [ ] **Step 5: Commit**

Commit message:

```text
feat: register dice roll realtime event
```

---

### Task 2: Create secure dice-gm Realtime authorization policies

**Files:**
- Create: `supabase-dice-realtime-rls.sql`

**Interfaces:**
- Produces private topic authorization for `dice-gm:{campaign_uuid}`.
- SELECT allowed only to campaign owner.
- INSERT allowed to campaign owner or current campaign member.

- [ ] **Step 1: Snapshot current six Realtime policies before changes**

Run:

```sql
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'realtime' and tablename = 'messages'
order by policyname;
```

Expected baseline: existing online/profile/campaign policies unchanged from P1B.2.

- [ ] **Step 2: Write the SELECT policy with safe UUID guard**

```sql
create policy "dice_gm_owner_read"
on realtime.messages
for select
to authenticated
using (
  case
    when (select realtime.topic()) like 'dice-gm:%'
     and split_part((select realtime.topic()), ':', 2)
       ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then exists (
      select 1
      from public.campaigns c
      where c.id = split_part((select realtime.topic()), ':', 2)::uuid
        and c.deleted_at is null
        and c.owner_profile_id = (select auth.uid())::text
    )
    else false
  end
);
```

- [ ] **Step 3: Write the INSERT policy**

```sql
create policy "dice_gm_member_or_owner_write"
on realtime.messages
for insert
to authenticated
with check (
  case
    when (select realtime.topic()) like 'dice-gm:%'
     and split_part((select realtime.topic()), ':', 2)
       ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then (
      exists (
        select 1 from public.campaigns c
        where c.id = split_part((select realtime.topic()), ':', 2)::uuid
          and c.deleted_at is null
          and c.owner_profile_id = (select auth.uid())::text
      )
      or exists (
        select 1 from public.campaign_members cm
        where cm.campaign_id = split_part((select realtime.topic()), ':', 2)::uuid
          and cm.profile_id = (select auth.uid())::text
      )
    )
    else false
  end
);
```

- [ ] **Step 4: Preflight in a transaction**

Apply both `CREATE POLICY` statements inside a transaction and evaluate policy predicates for:

- campaign owner;
- member A;
- member B;
- outsider;
- malformed `dice-gm:not-a-uuid`.

Expected matrix:

| Identity | SELECT dice-gm | INSERT dice-gm |
|---|---:|---:|
| GM/owner | true | true |
| member A | false | true |
| member B | false | true |
| outsider | false | false |

Malformed topic -> false, no UUID cast exception.

Rollback after preflight.

- [ ] **Step 5: Apply migration using Supabase migration tooling**

Migration name:

```text
dice_gm_realtime_authorization
```

- [ ] **Step 6: Verify production policy count and definitions**

Expected: previous policies unchanged plus exactly two new dice-gm policies.

- [ ] **Step 7: Run Supabase security/performance advisors**

No new Realtime security warning or init-plan regression is acceptable.

- [ ] **Step 8: Commit**

Commit message:

```text
db: authorize secret dice realtime
```

---

### Task 3: Implement public and secret transport helpers

**Files:**
- Create: `src/services/realtime/diceRealtime.ts`
- Modify: `scripts/verify-dice-realtime.mjs`

**Interfaces:**
- Produces `isRollResultPayload(value): value is RollResult`.
- Produces `sendSecretRollToGm(campaignId, result): Promise<void>`.

- [ ] **Step 1: Extend RED verifier**

Assert `diceRealtime.ts` must:

- use `dice-gm:${campaignId}`;
- configure the channel as private;
- use `httpSend('dice_roll', result)`;
- remove the temporary send-only channel in `finally`;
- never subscribe in the send helper.

- [ ] **Step 2: Implement strict-enough payload guard**

Reject payloads missing or mismatching:

```ts
id, campaignId, rollerId, rollerName, formulaName,
formulaText, visibility, diceGroups, comparisons, total, createdAt
```

Also require `visibility` to be `public` or `secret` and finite `total`.

- [ ] **Step 3: Implement send-only secret helper**

```ts
export async function sendSecretRollToGm(campaignId: string, result: RollResult) {
  const channel = supabase.channel(`dice-gm:${campaignId}`, {
    config: { private: true },
  });
  try {
    const response = await channel.httpSend('dice_roll', result);
    if (response !== 'ok') throw new Error(`Secret dice broadcast failed: ${String(response)}`);
  } finally {
    await supabase.removeChannel(channel);
  }
}
```

Adapt the exact success value to Supabase JS 2.108.1 typings/runtime if necessary, but preserve send-only/no-subscribe semantics.

- [ ] **Step 4: Run GREEN**

```bash
node scripts/verify-dice-realtime.mjs
npm run typecheck
```

- [ ] **Step 5: Commit**

Commit message:

```text
feat: add secure dice realtime transport
```

---

### Task 4: Route local rolls by visibility and role

**Files:**
- Modify: `src/app/components/session/dice/DiceSessionContext.tsx`

**Interfaces:**
- Existing `submitLocalRoll(request)` remains consumer-facing API.
- Add internal `ingestRoll(result, source)` and asynchronous transport routing.

- [ ] **Step 1: Add id-based ingestion**

Use a `Set<string>` ref or map keyed by result id. `ingestRoll` returns false for duplicates and never reorders an already-ingested roll.

- [ ] **Step 2: Determine role**

```ts
const isGm = activeCampaign?.ownerId === user?.id;
```

- [ ] **Step 3: Route public local rolls**

Sequence:

1. Generate result once.
2. Ingest locally immediately.
3. `await campaignChannel.send('dice_roll', result)`.
4. On send error, preserve local result and show a transport error toast.

Do not regenerate after a send failure.

- [ ] **Step 4: Route secret player rolls**

Sequence:

1. Generate secret result once.
2. Ingest locally.
3. `sendSecretRollToGm(campaignId, result)`.
4. No campaign-channel broadcast.

- [ ] **Step 5: Route secret GM rolls**

Generate and ingest locally only. Do not call any Realtime send helper.

- [ ] **Step 6: Preserve builder test rule**

The builder still passes `visibility:'public'`, so it always follows public routing.

- [ ] **Step 7: Commit**

Commit message:

```text
feat: route public and secret dice rolls
```

---

### Task 5: Receive authorized remote rolls

**Files:**
- Modify: `src/app/components/session/dice/DiceSessionContext.tsx`
- Modify: `scripts/verify-dice-realtime.mjs`

**Interfaces:**
- Public listener consumes campaign `dice_roll`.
- GM-only listener consumes `dice-gm:{campaignId}` `dice_roll`.

- [ ] **Step 1: Attach public listener through existing `useCampaignChannel`**

```ts
useCampaignChannel(activeCampaign?.id, {
  onBroadcast: {
    dice_roll: (msg) => { ... }
  }
});
```

Read `msg.payload`, validate with `isRollResultPayload`, require `payload.campaignId === activeCampaign.id`, then ingest.

- [ ] **Step 2: Attach GM secret listener only when current user is GM**

Use generalized `useRealtimeChannel` with topic:

```ts
isGm && activeCampaign?.id ? `dice-gm:${activeCampaign.id}` : null
```

and handle only `dice_roll`.

A non-GM client must never subscribe to this topic.

- [ ] **Step 3: Reject forged/mismatched transport metadata locally**

For secret GM-channel reception require:

- `visibility === 'secret'`;
- `rollerId !== activeCampaign.ownerId` for player-secret traffic; GM-secret should never arrive via transport.

For public campaign traffic require `visibility === 'public'`.

- [ ] **Step 4: Dedupe local echo/race**

Even if transport configuration changes to echo self later, the id guard must prevent double cards.

- [ ] **Step 5: Run verifier/typecheck**

```bash
node scripts/verify-dice-realtime.mjs
npm run typecheck
```

- [ ] **Step 6: Commit**

Commit message:

```text
feat: receive multiplayer dice rolls
```

---

### Task 6: Preserve local-only history controls and reroll visibility

**Files:**
- Modify: `src/app/components/session/dice/DiceSessionContext.tsx`
- Modify: `src/app/components/session/dice/DiceRollHistoryCard.tsx`
- Modify: `src/app/components/session/dice/DiceRollHistoryDrawer.tsx`

**Interfaces:**
- `clearLocalHistory()` remains purely local.
- `reroll()` re-enters normal submit routing with original visibility.

- [ ] **Step 1: Ensure Clear has no send path**

The Clear handler may call only local state mutation. Static verifier must fail if `clearLocalHistory` body references `send`, `httpSend`, or `supabase`.

- [ ] **Step 2: Reroll through submit path**

Do not clone the old numeric results. Use stored source items and generate a fresh canonical result with the same visibility and formula identity/name.

- [ ] **Step 3: Add subtle secret indicator**

Authorized history cards for secret results show EyeOff/`Segreto` using palette variables. This is informational only and cannot change historical visibility.

- [ ] **Step 4: Verify late-join semantics**

No query/subscription replay or persistent store is added. On provider mount, `rolls` starts `[]`.

- [ ] **Step 5: Commit**

Commit message:

```text
feat: preserve local dice history controls
```

---

### Task 7: Multi-client verification and repository gate

**Files:**
- Modify: `package.json`
- Modify: `scripts/verify-dice-realtime.mjs`

**Interfaces:**
- Adds `verify:dice-realtime` to repository `check`.

- [ ] **Step 1: Add script**

```json
"verify:dice-realtime": "node scripts/verify-dice-realtime.mjs"
```

Place before build in `check`.

- [ ] **Step 2: Full automated gate**

Run:

```bash
npm ci
npm audit --audit-level=high
npm run check
```

- [ ] **Step 3: Run Realtime authorization smoke matrix with three authenticated browser sessions**

Use GM, Player A, Player B in the same active campaign.

Expected:

| Roll | GM | Player A | Player B |
|---|---|---|---|
| A public | sees | sees | sees |
| A secret | sees | sees | does not see |
| B secret | sees | does not see | sees |
| GM public | sees | sees | sees |
| GM secret | sees | does not see | does not see |

Verify both history cards and absence of unauthorized console payload handling.

- [ ] **Step 4: Verify simultaneous/rapid rolls without 3D**

Fire several rolls quickly from different clients. Every authorized history must contain each delivered roll exactly once; ordering follows receipt time. No card is lost.

- [ ] **Step 5: Verify local Clear**

Clear Player A. GM and Player B histories remain unchanged. New subsequent public roll appears on all authorized clients.

- [ ] **Step 6: Verify late join**

Open a fresh Player B client after prior rolls. Its history starts empty and only receives subsequent rolls.

- [ ] **Step 7: Verify CI/Vercel exact SHA**

Do not mark Plan 2 complete until GitHub CI and Vercel both report success for the same final commit.

- [ ] **Step 8: Commit**

Commit message:

```text
feat: complete multiplayer dice realtime
```

---

## Plan 2 Completion Gate

Plan 2 is complete only when:

- existing shared campaign Realtime lifecycle remains intact;
- dice-gm RLS matrix is verified in production;
- public/secret matrix passes with GM + two players;
- late join and local Clear behavior match the spec;
- no secret-player payload reaches another player's campaign channel handler;
- all dice results remain volatile;
- `npm audit --audit-level=high`, `npm run check`, CI, and Vercel are green.

After Plan 2, the full functional dice system is complete without 3D. Plan 3 adds only the optional presentation layer and delayed reveal behavior.