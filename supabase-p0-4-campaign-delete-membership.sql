-- P0.4 — Campaign delete security/consistency guard
--
-- The canonical server uses soft-delete for campaigns so legacy/entity data is
-- preserved. A deleted campaign must nevertheless revoke player membership in
-- the SAME database transaction; otherwise campaign_members could keep granting
-- direct RLS access to campaign entities after the campaign disappears from UI.
--
-- Edge Function calls this RPC with the service-role client. It is intentionally
-- not executable by anon/authenticated clients.

create or replace function public.soft_delete_campaign_and_revoke_members(
  p_campaign_id uuid,
  p_owner_profile_id text
)
returns table(profile_id text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.campaigns c
    where c.id = p_campaign_id
      and c.owner_profile_id = p_owner_profile_id
      and c.deleted_at is null
  ) then
    raise exception 'Campaign not found or not owned'
      using errcode = 'P0001';
  end if;

  update public.campaigns
  set deleted_at = now(),
      updated_at = now()
  where id = p_campaign_id
    and owner_profile_id = p_owner_profile_id
    and deleted_at is null;

  return query
  delete from public.campaign_members cm
  where cm.campaign_id = p_campaign_id
  returning cm.profile_id;
end;
$$;

revoke all on function public.soft_delete_campaign_and_revoke_members(uuid, text) from public;
revoke all on function public.soft_delete_campaign_and_revoke_members(uuid, text) from anon;
revoke all on function public.soft_delete_campaign_and_revoke_members(uuid, text) from authenticated;
grant execute on function public.soft_delete_campaign_and_revoke_members(uuid, text) to service_role;
