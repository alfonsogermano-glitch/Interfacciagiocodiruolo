# Realtime campaign-channel authorization audit — 2026-11-10

## Verified code
`src/services/realtime/campaignChannel.ts` creates `supabase.channel(topic,{config:{private:true}})` in cloud mode, calls `supabase.realtime.setAuth()`, and shares one subscribed channel per topic. Campaign topics are `campaign:${campaignId}`. Broadcasts are sent by the client with `ch.send({type:'broadcast',event,payload})`. Local mode bypasses Supabase, as intended.

## Verified read-only production database state
- `realtime.messages` has RLS enabled.
- A SELECT policy `characters_broadcast_select` covers `campaign:%` topics, checks UUID syntax, and requires campaign owner or member, using `auth.uid()`.
- INSERT policies `campaign_presence_member_write` and `campaign_presence_owner_write` cover `campaign:%` topics for owner/member, **but their predicates do not constrain `extension='presence'`**. They are named presence policies but, as written, may also authorize broadcast sends by campaign members; verify actual Supabase Realtime extension semantics and any other effective policies.
- Other policies authorize `online:all` presence and own profile SELECT.
- SQL GRANTs exist for `authenticated` and `anon`, but RLS is the controlling restriction.
- No policy explicitly named for campaign broadcast INSERT was found. This alone does not prove broadcast sending fails, because INSERT policies are permissive and their predicates do not restrict extension type.

## Security assessment
A nonmember should be denied subscription by the SELECT policy, but this **has not been tested using a nonmember JWT**. An authorized member may be able to send arbitrary `chat_reaction` or `chat_delete` payloads. That is why client listeners must not treat broadcasts as authoritative. Client `private:true` is necessary but server-side RLS is the enforcement boundary.

## Next staging tests
1. GM A, member A, nonmember B: subscribe and send to `campaign:A`; B must fail both.
2. Verify authorized GM/member broadcasts and presence work, with `extension` variations.
3. Attempt forged reaction/delete payloads from a legitimate member; other clients must not blindly mutate authoritative UI state.
4. Confirm `profile:{uid}` and `online:all` existing behaviors remain intact.
5. Consider dedicated INSERT policies with explicit `extension IN ('broadcast','presence')` and owner/member conditions only after checking current behavior. Do not change production policies without staging tests.

No production mutation; read-only database and code audit only.
