-- PROPOSAL ONLY. Run exclusively on a disposable staging database.
-- Do not apply to production until direct API and realtime tests pass.
BEGIN;
DROP POLICY IF EXISTS chat_messages_select ON public.chat_messages;
DROP POLICY IF EXISTS chat_messages_insert ON public.chat_messages;
DROP POLICY IF EXISTS chat_messages_update_reactions ON public.chat_messages;

CREATE POLICY chat_messages_select ON public.chat_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = chat_messages.campaign_id
        AND c.owner_profile_id = (SELECT auth.uid())::text
    )
    OR EXISTS (
      SELECT 1 FROM public.campaign_members m
      WHERE m.campaign_id = chat_messages.campaign_id
        AND m.profile_id = (SELECT auth.uid())::text
    )
  );

CREATE POLICY chat_messages_insert ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())::text
    AND (
      EXISTS (
        SELECT 1 FROM public.campaigns c
        WHERE c.id = chat_messages.campaign_id
          AND c.owner_profile_id = (SELECT auth.uid())::text
      )
      OR EXISTS (
        SELECT 1 FROM public.campaign_members m
        WHERE m.campaign_id = chat_messages.campaign_id
          AND m.profile_id = (SELECT auth.uid())::text
      )
    )
  );

-- UPDATE intentionally denied to authenticated users until reactions API
-- is audited. An RLS UPDATE policy alone cannot restrict updated columns.
-- Do not grant an unrestricted UPDATE policy as a workaround.
COMMIT;
