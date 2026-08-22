-- P1B.2 — Realtime RLS init-plan optimization + safe UUID topic guard
-- Changes exactly four existing policies on realtime.messages.
-- No data changes, no Realtime schema object changes, no online:all policy changes.

alter policy "authenticated can listen to own profile channel"
on realtime.messages
using (
  (select realtime.topic()) like 'profile:%'
  and split_part((select realtime.topic()), ':', 2) = (select auth.uid())::text
);

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
