begin;

create or replace function public.admin_list_users()
returns table (user_id uuid, email text, display_name text, role text, registered_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.user_roles r where r.user_id = auth.uid() and r.role = 'admin') then
    raise exception 'Accesso riservato agli amministratori' using errcode = '42501';
  end if;
  return query
    select u.id, u.email::text, coalesce(p.display_name::text, u.email::text, 'Utente'),
      coalesce(r.role, 'standard'), u.created_at
    from auth.users u
    left join public.profiles p on p.id::text = u.id::text
    left join public.user_roles r on r.user_id = u.id
    order by u.created_at desc, u.id;
end;
$$;

create or replace function public.admin_set_user_role(target_user_id uuid, new_role text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.user_roles r where r.user_id = auth.uid() and r.role = 'admin') then
    raise exception 'Accesso riservato agli amministratori' using errcode = '42501';
  end if;
  if new_role is null or new_role not in ('admin', 'standard') then
    raise exception 'Tipologia utente non valida' using errcode = '22023';
  end if;
  -- Serializza le modifiche: anche due richieste contemporanee non possono
  -- rimuovere tutti gli amministratori.
  lock table public.user_roles in share row exclusive mode;
  if not exists (select 1 from public.user_roles r where r.user_id = auth.uid() and r.role = 'admin') then
    raise exception 'Accesso riservato agli amministratori' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users u where u.id = target_user_id) then
    raise exception 'Utente non trovato' using errcode = '22023';
  end if;
  if new_role = 'standard'
    and exists (select 1 from public.user_roles r where r.user_id = target_user_id and r.role = 'admin')
    and (select count(*) from public.user_roles r where r.role = 'admin') <= 1 then
    raise exception 'Deve rimanere almeno un Amministratore' using errcode = '22023';
  end if;
  insert into public.user_roles (user_id, role) values (target_user_id, new_role)
    on conflict (user_id) do update set role = excluded.role;
end;
$$;

revoke all on function public.admin_list_users() from public, anon;
revoke all on function public.admin_set_user_role(uuid, text) from public, anon;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_set_user_role(uuid, text) to authenticated;
commit;
