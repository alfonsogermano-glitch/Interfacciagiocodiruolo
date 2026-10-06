begin;

-- Equipaggiamento del personaggio, una riga per oggetto: schema relazionale
-- CharacterEquipmentRow + mapCharacterEquipmentRow. L'accesso passa da
-- contentFetch: IndexedDB in Locale, Supabase in Cloud.
create table if not exists public.character_equipment (
  id uuid primary key,
  character_id uuid not null references public.characters(id) on delete cascade,
  catalog_item_id uuid references public.equipment_catalog(id) on delete set null,
  source text not null default 'catalog',
  name text not null,
  type text not null,
  description text default '',
  location text not null,
  inseparabile boolean not null default false,
  is_vehicle boolean not null default false,
  quantity integer not null default 1,
  custom_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tabella preesistente: aggiunge le colonne canoniche mancanti e rimuove le
-- colonne payload/owner_profile_id della prima versione di questa migration
-- (non scritte dal servizio: il dato e' nelle colonne relazionali).
alter table public.character_equipment add column if not exists quantity integer not null default 1;
alter table public.character_equipment add column if not exists custom_data jsonb not null default '{}'::jsonb;
alter table public.character_equipment drop column if exists payload;
alter table public.character_equipment drop column if exists owner_profile_id;

-- EquipmentLocation dell'applicazione ha 5 valori, il vincolo originale 3.
alter table public.character_equipment drop constraint if exists character_equipment_location_check;
alter table public.character_equipment add constraint character_equipment_location_check
  check (location in ('in_tasca', 'nel_zaino', 'indossato', 'a_casa', 'disponibile'));

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.character_equipment'::regclass and contype = 'p'
  ) then
    alter table public.character_equipment add primary key (id);
  end if;
exception when others then
  raise notice 'Primary key non aggiunta su character_equipment: %', sqlerrm;
end $$;

create index if not exists character_equipment_character_idx on public.character_equipment(character_id);
alter table public.character_equipment enable row level security;

create or replace function public.can_manage_character_equipment(character_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.characters c
    left join public.campaigns camp on camp.id::text = c.campaign_id::text
    where c.id::text = character_key
      and (c.owner_profile_id::text = auth.uid()::text or camp.owner_profile_id::text = auth.uid()::text)
  );
$$;
revoke all on function public.can_manage_character_equipment(text) from public, anon;
grant execute on function public.can_manage_character_equipment(text) to authenticated;
grant select, insert, update, delete on public.character_equipment to authenticated;

-- Cast esplicito a text nella policy: character_id e' uuid nella tabella
-- preesistente e senza il cast Postgres non trova la funzione (42883).
drop policy if exists character_equipment_access on public.character_equipment;
drop policy if exists character_equipment_policy on public.character_equipment;
create policy character_equipment_access on public.character_equipment for all to authenticated
  using (public.can_manage_character_equipment(character_id::text))
  with check (public.can_manage_character_equipment(character_id::text));
commit;
