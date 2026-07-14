-- Fix isolamento palette/dashboard settings tra utenti.
--
-- dashboard_settings era una singola riga globale condivisa da tutti gli
-- utenti: `key` era PRIMARY KEY da solo (sempre la stessa costante fissa
-- 'dashboard_settings' lato client), e ogni upsert con onConflict: 'key'
-- sovrascriveva l'unica riga esistente per chiunque la scrivesse. RLS era
-- disabilitato: nessuna barriera nemmeno a livello database.
--
-- owner_profile_id esiste gia' come colonna (nullable, mai scritta dal
-- codice client) - qui diventa obbligatoria e parte della chiave.
--
-- Verificato via query di sola lettura sul progetto live prima di scrivere
-- questo file: dashboard_settings_pkey = PRIMARY KEY (key), relrowsecurity
-- = false, zero policy esistenti, unica riga esistente gia' con
-- owner_profile_id valorizzato (quindi ALTER ... SET NOT NULL sicuro).

alter table dashboard_settings
  alter column owner_profile_id set not null;

alter table dashboard_settings
  drop constraint dashboard_settings_pkey;

alter table dashboard_settings
  add constraint dashboard_settings_pkey primary key (key, owner_profile_id);

alter table dashboard_settings enable row level security;

create policy dashboard_settings_select_own
  on dashboard_settings for select
  using (owner_profile_id = auth.uid()::text);

create policy dashboard_settings_insert_own
  on dashboard_settings for insert
  with check (owner_profile_id = auth.uid()::text);

create policy dashboard_settings_update_own
  on dashboard_settings for update
  using (owner_profile_id = auth.uid()::text);

create policy dashboard_settings_delete_own
  on dashboard_settings for delete
  using (owner_profile_id = auth.uid()::text);
