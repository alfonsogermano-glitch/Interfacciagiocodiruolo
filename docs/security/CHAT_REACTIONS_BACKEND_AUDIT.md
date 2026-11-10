# Chat reactions — backend audit, 10 November 2026

## Verified evidence
Read-only inspection of deployed Supabase Edge Function `make-server-771c5bfd` version 91, file `functions/server/index.tsx` (~3,385 lines): no literal occurrences of `chat_messages`, `reactions`, `reaction`, or `/chat` in this file. This does **not** prove the frontend writes directly to Supabase: other client modules, functions, RPCs and SQL triggers remain to be inspected.

## Why the proposed patch is not production-ready
The proposed `chat_rls_staging_only.sql` intentionally removes the broad UPDATE policy without replacement. If the client updates `chat_messages.reactions` via PostgREST, this would break reactions. A row-level UPDATE policy alone cannot prevent updates to `content`, `sender_id`, or `campaign_id` on the same row. Do not deploy it as-is.

## Next evidence required
1. Locate client calls involving `from('chat_messages')`, `from("chat_messages")`, `.update({ reactions`, and Realtime channel subscriptions; code search returned no indexed results in the current connector.
2. Inspect database column-specific GRANTs and triggers in read-only mode.
3. Confirm whether a reaction can be toggled on another user's message, and whether that is an intended feature.
4. Design an RPC or a column-restricted UPDATE grant after testing the existing client contract. RPC authorization must check membership, campaign and allowed reaction payload; consider concurrency and lost updates.
5. Test two isolated campaigns and all expected chat/reaction/realtime flows in staging before merging.

## Current decision
No production SQL changes. Keep issue #48 open. Treat the proposed policy as a staging-only sketch requiring compatibility work.
