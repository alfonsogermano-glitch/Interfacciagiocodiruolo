-- Cartelle per organizzare PG/Precompilati/PNG/Mostri nella griglia di
-- CampaignHome.tsx e nella lista laterale di SessionCharactersPanel.tsx
-- (Fase 0 della feature "cartelle" - solo schema, nessuna UI ancora).
--
-- entity_type distingue 4 "namespace" di cartelle: 'character' (PG normali),
-- 'premade' (Precompilati - fisicamente righe di characters con
-- available_for_players=true, ma tenute in un namespace di cartelle separato
-- apposta: quando un Precompilato viene richiesto da un giocatore e smette
-- di essere tale, la cartella 'premade' a cui apparteneva smette di essere
-- interrogata nella vista PG e la card torna semplicemente senza cartella,
-- invece di trascinarsi dietro un concetto di cartella incoerente con la
-- nuova sezione in cui e' comparsa), 'npc', 'monster'. Nessun namespace
-- 'campaign': le cartelle vivono sempre dentro una campagna specifica.
--
-- position segue lo stesso pattern di environments.sort_order (vedi
-- supabase-migration-complete-schema.sql): intero libero, riassegnato lato
-- client ad ogni riordino (nessun vincolo UNIQUE, evita di dover fare
-- shift-and-renumber lato server per ogni drag).
--
-- Esegui questo script nella dashboard di Supabase (SQL Editor).

create table if not exists folders (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  entity_type text not null check (entity_type = any (array['character'::text, 'premade'::text, 'npc'::text, 'monster'::text])),
  name text not null,
  position integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_folders_campaign_type on folders(campaign_id, entity_type);

alter table characters add column if not exists folder_id uuid references folders(id) on delete set null;
alter table npcs add column if not exists folder_id uuid references folders(id) on delete set null;
alter table monsters add column if not exists folder_id uuid references folders(id) on delete set null;

create index if not exists idx_characters_folder on characters(folder_id);
create index if not exists idx_npcs_folder on npcs(folder_id);
create index if not exists idx_monsters_folder on monsters(folder_id);

-- =====================================================
-- Vincolo cross-tipo: un mostro non puo' finire in una cartella PNG, un PG
-- non puo' finire in una cartella Precompilati (e viceversa), etc. Non
-- esprimibile con un CHECK cross-tabella in Postgres - serve un trigger per
-- tabella, stessa logica ripetuta tre volte (nessuna astrazione condivisa
-- possibile per un trigger PL/pgSQL senza complicare la firma).
-- =====================================================

create or replace function check_character_folder_type()
returns trigger as $$
begin
  if new.folder_id is not null then
    if not exists (
      select 1 from folders
      where id = new.folder_id
        and campaign_id = new.campaign_id
        and entity_type = case when new.available_for_players then 'premade' else 'character' end
    ) then
      raise exception 'folder_id non valido per questo personaggio (tipo o campagna non corrispondenti)';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_check_character_folder_type on characters;
create trigger trg_check_character_folder_type
  before insert or update of folder_id, campaign_id, available_for_players on characters
  for each row execute function check_character_folder_type();

create or replace function check_npc_folder_type()
returns trigger as $$
begin
  if new.folder_id is not null then
    if not exists (
      select 1 from folders
      where id = new.folder_id
        and campaign_id = new.campaign_id
        and entity_type = 'npc'
    ) then
      raise exception 'folder_id non valido per questo PNG (tipo o campagna non corrispondenti)';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_check_npc_folder_type on npcs;
create trigger trg_check_npc_folder_type
  before insert or update of folder_id, campaign_id on npcs
  for each row execute function check_npc_folder_type();

create or replace function check_monster_folder_type()
returns trigger as $$
begin
  if new.folder_id is not null then
    if not exists (
      select 1 from folders
      where id = new.folder_id
        and campaign_id = new.campaign_id
        and entity_type = 'monster'
    ) then
      raise exception 'folder_id non valido per questo mostro (tipo o campagna non corrispondenti)';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_check_monster_folder_type on monsters;
create trigger trg_check_monster_folder_type
  before insert or update of folder_id, campaign_id on monsters
  for each row execute function check_monster_folder_type();

-- =====================================================
-- RLS: stesso pattern di adventures/environments in
-- supabase-fix-rls-gm-tables.sql - lettura per proprietario campagna o
-- membro, scrittura solo per il proprietario (GM). Coerente con "cartelle
-- gestite solo dal GM, visibili identiche a tutti".
-- =====================================================

alter table folders enable row level security;

create policy folders_select_own_or_member on folders for select
  using (
    exists (select 1 from campaigns where campaigns.id = folders.campaign_id and campaigns.owner_profile_id = auth.uid()::text)
    or exists (select 1 from campaign_members where campaign_members.campaign_id = folders.campaign_id and campaign_members.profile_id = auth.uid()::text)
  );

create policy folders_insert_own on folders for insert
  with check (exists (select 1 from campaigns where campaigns.id = folders.campaign_id and campaigns.owner_profile_id = auth.uid()::text));

create policy folders_update_own on folders for update
  using (exists (select 1 from campaigns where campaigns.id = folders.campaign_id and campaigns.owner_profile_id = auth.uid()::text));

create policy folders_delete_own on folders for delete
  using (exists (select 1 from campaigns where campaigns.id = folders.campaign_id and campaigns.owner_profile_id = auth.uid()::text));
