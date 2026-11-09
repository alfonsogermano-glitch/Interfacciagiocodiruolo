-- PROPOSAL: run on isolated staging only, after confirming client update contract.
-- Complements chat_rls_staging_only.sql, which removes broad UPDATE policy.
-- This is a candidate if frontend updates only the 'reactions' field.
BEGIN;
REVOKE UPDATE ON TABLE public.chat_messages FROM anon, authenticated;
-- Explicitly remove column-level UPDATE privileges if previously assigned.
REVOKE UPDATE (id,campaign_id,sender_id,sender_name,sender_avatar_url,content,created_at,kind,payload,reactions)
  ON TABLE public.chat_messages FROM anon, authenticated;

GRANT UPDATE (reactions) ON TABLE public.chat_messages TO authenticated;

CREATE POLICY chat_messages_update_reactions_member
  ON public.chat_messages
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.campaigns c
      WHERE c.id=chat_messages.campaign_id AND c.owner_profile_id=(SELECT auth.uid())::text)
    OR EXISTS (SELECT 1 FROM public.campaign_members m
      WHERE m.campaign_id=chat_messages.campaign_id AND m.profile_id=(SELECT auth.uid())::text)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.campaigns c
      WHERE c.id=chat_messages.campaign_id AND c.owner_profile_id=(SELECT auth.uid())::text)
    OR EXISTS (SELECT 1 FROM public.campaign_members m
      WHERE m.campaign_id=chat_messages.campaign_id AND m.profile_id=(SELECT auth.uid())::text)
  );
COMMIT;
-- IMPORTANT: membership is checked on both old/new row. Only UPDATE(reactions)
-- is granted; table-wide UPDATE must remain revoked. Check inherited grants.
-- Must validate PostgREST response shape, Realtime, concurrent reactions, and
-- all client update flows before deploying. Never run on production as-is.
