# Verified frontend chat contract — 2026-11-10

Source inspected on repository default branch:
- `src/services/supabase/chatService.ts`
- `scripts/verify-chat-reactions.mjs`

## Confirmed direct Supabase calls
- `sendChatMessage`: INSERT into `chat_messages` with `sender_id=input.senderId`, `kind='message'`, and optional quote payload.
- `sendChatAttachment`: INSERT with `kind='attachment'` and attachment metadata.
- `toggleChatReaction`: SELECT `reactions` by message id; compute new JSON array in client; UPDATE **only** `{reactions:next}` and SELECT `reactions`. This supports column-restricted UPDATE grants, pending staging tests.
- `saveRollEntry`: UPSERT with `ignoreDuplicates:true`, `sender_id=roll.rollerId`, `kind='roll'`. Comment explicitly states **every client receiving the roll can attempt the insert**, not only the original roller.
- `deleteChatMessage` and `clearChatMessages`: DELETE through Supabase client.
- Existing `verify-chat-reactions.mjs` static test asserts reaction UPDATE shape and client behavior, but does not exercise RLS authorization or concurrency.

## Critical incompatibility discovered
The staging-only draft `chat_rls_staging_only.sql` requires `sender_id=auth.uid()::text` for **every** INSERT. That would reject inserts performed by recipients who persist another user's public roll. Do **not** apply this draft as-is even in shared staging without adjusting roll persistence. Do **not** loosen sender validation to allow arbitrary spoofed rolls; consider making only the original roller persist, or a server-side authenticated relay with validated roll provenance. Test duplicate handling, missing original roller, and late joiners.

## Reaction integrity
The client computes a whole JSON array read-modify-write and takes `input.userId` from the caller. Column grants prevent editing message text but **do not** prevent forging/deleting other users' reactions inside the JSON array or overwriting concurrent changes. For robust integrity, use a security-reviewed atomic RPC accepting message id + emoji and deriving user id from `auth.uid()`, with campaign membership check and row lock. Do not deploy an unreviewed SECURITY DEFINER RPC.

## Additional follow-up
- Check `src/app/components/session/SessionChatPanel.tsx` for broadcast flows and caller-provided IDs.
- Check `supabase/*chat_messages_reactions.sql` migration for deployed policy details.
- Build negative tests for unauthorized SELECT/INSERT/UPDATE/DELETE, spoofed reaction identities, concurrent reactions, roll inserts by peers, and Realtime.
- Staging is not yet provisioned; no live tests were run.

**Production unchanged. Both proposed SQL files remain review-only and are NOT ready for deployment.**
