-- Ruoli applicativi: modificabili solo da SQL/service role, mai dal profilo.
begin;
create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'standard' check (role in ('admin', 'standard'))
);
alter table public.user_roles enable row level security;
revoke all on public.user_roles from anon, authenticated;
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
drop policy if exists "Read own application role" on public.user_roles;
create policy "Read own application role" on public.user_roles
  for select to authenticated using (user_id = auth.uid());

insert into public.user_roles (user_id, role)
select id, case when lower(email) = 'alfonso.germano@gmail.com'
  then 'admin' else 'standard' end from auth.users
on conflict (user_id) do update set role = excluded.role;

create or replace function public.assign_standard_user_role()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.user_roles (user_id, role) values (new.id, 'standard');
  return new;
end;
$$;
revoke all on function public.assign_standard_user_role() from public;
drop trigger if exists assign_application_role on auth.users;
create trigger assign_application_role after insert on auth.users
for each row execute function public.assign_standard_user_role();
commit;
