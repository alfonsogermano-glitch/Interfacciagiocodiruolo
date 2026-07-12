-- Raccolta immagini: registro di asset immagine condivisi tra le entita' di
-- un utente (PG/PNG/Mostri), con riferimento vivo - la sorgente e'
-- condivisa (un'unica riga image_assets), il ritaglio resta per-entita'
-- (portrait_crop_area, gia' esistente, invariata).
--
-- Fase 1 (questo script): solo schema e collegamento. Il rendering continua
-- a usare portrait_image_url/portrait_source_image_url come oggi - lo
-- switch al rendering "sorgente condivisa + crop per-entita' al volo" e'
-- Fase 2, non tocca lo schema.
--
-- Stesso pattern delle altre alter-script in questo repo (vedi
-- supabase-add-token-studio.sql): TEXT/UUID liberi, validati solo lato
-- applicativo, nessun enum/CHECK oltre alla FK. Esegui nella dashboard di
-- Supabase (SQL Editor), in ordine - le sezioni 1-2 sono idempotenti, la
-- sezione 3 (RLS) va verificata a mano (vedi nota li').

-- =====================================================
-- 1) Tabella image_assets
-- =====================================================
-- uuid_generate_v4() per coerenza con id delle altre tabelle (extension
-- uuid-ossp, gia' abilitata - vedi campaigns/characters/... in
-- supabase-schema.sql), non gen_random_uuid() (pgcrypto): stessa funzione,
-- diversa extension, meglio restare su una sola convenzione nel progetto.
create table if not exists image_assets (
  id uuid primary key default uuid_generate_v4(),
  owner_profile_id text not null,
  source_image_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Filtro principale della raccolta (loadImageAssetsByOwner): tutte le query
-- su questa tabella filtrano per owner_profile_id, mai per lookup singolo -
-- a differenza di characters/npcs/monsters (filtrati perlopiu' per
-- campaign_id, gia' indicizzato), qui l'indice manca finche' non lo
-- aggiungiamo esplicitamente.
create index if not exists idx_image_assets_owner on image_assets(owner_profile_id);

-- Riusa la function condivisa gia' definita in supabase-schema.sql (sezione
-- "TRIGGER per aggiornare updated_at automaticamente") - non ridichiarata
-- qui. CREATE TRIGGER non supporta IF NOT EXISTS: il drop preventivo tiene
-- la sezione idempotente come le altre.
drop trigger if exists update_image_assets_updated_at on image_assets;
create trigger update_image_assets_updated_at before update on image_assets
  for each row execute function update_updated_at_column();

-- =====================================================
-- 2) Collegamento dalle entita' all'asset condiviso
-- =====================================================
-- Nullable e non retroattivo: assente = l'entita' mantiene il
-- comportamento attuale (immagine di proprieta' esclusiva), invariato in
-- questa fase - nessun backfill qui (deliberato, vedi indagine precedente:
-- un backfill da portrait_source_image_url esistenti e' un passo separato,
-- non incluso in questo script).
alter table characters add column if not exists portrait_asset_id uuid references image_assets(id);
alter table npcs add column if not exists portrait_asset_id uuid references image_assets(id);
alter table monsters add column if not exists portrait_asset_id uuid references image_assets(id);

-- =====================================================
-- 3) RLS - da verificare/applicare a mano in dashboard
-- =====================================================
-- Stesso limite gia' notato per characters/npcs/monsters: le loro policy
-- RLS non sono tracciate nei file SQL di questo repo (configurate a mano
-- su dashboard), quindi non posso verificare da qui che il predicato sotto
-- (auth.uid()::text = owner_profile_id) sia scritto esattamente cosi'
-- altrove - e' lo stesso pattern gia' documentato nel commento di
-- ImageCropCore.tsx per le RLS storage (path scoped per auth.uid()::text).
-- Esegui questa sezione nello SQL Editor solo dopo aver verificato che
-- corrisponda alla convenzione realmente in uso sulle altre tabelle.
alter table image_assets enable row level security;

drop policy if exists "image_assets_select_own" on image_assets;
create policy "image_assets_select_own" on image_assets
  for select using (auth.uid()::text = owner_profile_id);

drop policy if exists "image_assets_insert_own" on image_assets;
create policy "image_assets_insert_own" on image_assets
  for insert with check (auth.uid()::text = owner_profile_id);

drop policy if exists "image_assets_update_own" on image_assets;
create policy "image_assets_update_own" on image_assets
  for update using (auth.uid()::text = owner_profile_id)
  with check (auth.uid()::text = owner_profile_id);

drop policy if exists "image_assets_delete_own" on image_assets;
create policy "image_assets_delete_own" on image_assets
  for delete using (auth.uid()::text = owner_profile_id);
