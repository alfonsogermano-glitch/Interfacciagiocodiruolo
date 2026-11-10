# Chat security — realtime trust boundary and remediation design

Verified on default branch:
- `src/app/components/session/SessionChatPanel.tsx`: `applyReaction` invokes `toggleChatReaction`, then broadcasts `chat_reaction` with `{messageId,reactions}`.
- `handleChatReactionBroadcast` accepts a broadcast payload's `reactions` array and directly replaces local state, without fetching authoritative DB state or verifying sender authorization.
- `handleChatDeleteBroadcast` accepts `messageId` and removes the local entry and roll, again without checking DB deletion or broadcast sender.
- `handleSend` persists a message first, then broadcasts `chat_message` containing the saved entry.

## Security implications
RLS on `chat_messages` **does not secure Realtime Broadcast payloads**. A participant capable of broadcasting on the same campaign channel could potentially spoof reaction/delete events and cause other clients' UI to display incorrect state, even when database rows remain unchanged. The channel's access controls and any additional broadcast authorization still need examination; this is a potential UI-integrity risk, not a proven exploit.

## Proposed safe direction (not yet implemented)
1. For `chat_reaction`, broadcast only `messageId` as an invalidation hint. On receipt, fetch `reactions` from the database under the receiver's authenticated RLS; ignore messages not visible. Debounce to avoid amplification. For robust integrity, replace client JSON read-modify-write with an atomic authorized server-side operation deriving identity from `auth.uid()`.
2. For `chat_delete`, do not remove solely based on untrusted broadcast. Recheck existence/visibility via an authorized read, with a design that distinguishes deleted rows from inaccessible rows; alternatively send server-authenticated events or subscribe to authorized database changes.
3. Check `src/services/realtime/campaignChannel.ts` and Supabase Realtime authorization policies before assuming a campaign channel is isolated.
4. Preserve existing `chat_message` UX but treat broadcast entry as untrusted: load the row under RLS before displaying or verify using trusted DB change notifications.
5. Address multi-client roll persistence before enforcing `sender_id=auth.uid()` on INSERT. Do not simply exempt `kind='roll'` from sender validation.

## Acceptance tests
- Two campaigns, users A/B/C, separate authenticated sessions.
- Forged `chat_reaction` and `chat_delete` broadcast must not change other clients' authoritative state.
- Real reaction and delete propagate normally; reconnect and out-of-order events reconcile to DB.
- Nonmember cannot subscribe/send to a private campaign channel.
- Parallel emoji toggles preserve independent reactions.
- Public rolls persist once and late joiners see them; secret rolls never leak.

No production code, database, or Realtime configuration modified. This document is design-only.
