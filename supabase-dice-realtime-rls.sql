-- Secret dice roll transport.
-- Public rolls keep using the existing private campaign:{uuid} channel.
-- A player secret roll is written to dice-gm:{uuid}; only the campaign GM
-- can subscribe/read that topic. The roller keeps its own local result.

alter table realtime.messages enable row level security;

drop policy if exists "dice_gm_owner_read" on realtime.messages;
create policy "dice_gm_owner_read"
on realtime.messages
for select
to authenticated
using (
  extension = 'broadcast'
  and case
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

drop policy if exists "dice_gm_member_or_owner_write" on realtime.messages;
create policy "dice_gm_member_or_owner_write"
on realtime.messages
for insert
to authenticated
with check (
  extension = 'broadcast'
  and case
    when (select realtime.topic()) like 'dice-gm:%'
      and split_part((select realtime.topic()), ':', 2)
        ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then (
      exists (
        select 1
        from public.campaigns c
        where c.id = split_part((select realtime.topic()), ':', 2)::uuid
          and c.deleted_at is null
          and c.owner_profile_id = (select auth.uid())::text
      )
      or exists (
        select 1
        from public.campaign_members cm
        where cm.campaign_id = split_part((select realtime.topic()), ':', 2)::uuid
          and cm.profile_id = (select auth.uid())::text
      )
    )
    else false
  end
);
