-- Fix sicurezza urgente: sette tabelle leggibili/scrivibili pubblicamente
-- senza autenticazione (RLS mai abilitato). Trovate durante un audit
-- successivo al fix di isolamento di dashboard_settings, verificato
-- empiricamente con richieste REST usando solo la chiave anon pubblica
-- (nessuna sessione): visual_assets, equipment_catalog, adventures,
-- environments, situations, clues restituivano righe reali; character_equipment
-- risultava vuota ma comunque interrogabile.
--
-- adventures/environments: lettura consentita anche ai membri campagna
-- (necessaria a EntityDetailView.tsx, usato anche lato giocatore in sessione
-- da SessionCharactersPanel.tsx per le select Ambito narrativo/Luogo).
-- Scrittura solo al proprietario campagna (GM).
--
-- situations/clues/visual_assets/equipment_catalog: nessun percorso lato
-- giocatore trovato nel codice attuale - owner-only anche in lettura,
-- minimo privilegio coerente con l'uso reale.
--
-- character_equipment: non usata da alcun codice live oggi (l'equipaggiamento
-- dei PG vive in characters.sheet_data) - protetta per coerenza/difesa in
-- profondita', nessun impatto funzionale atteso.

alter table adventures enable row level security;
create policy adventures_select_own_or_member on adventures for select
  using (
    exists (select 1 from campaigns where campaigns.id = adventures.campaign_id and campaigns.owner_profile_id = auth.uid()::text)
    or exists (select 1 from campaign_members where campaign_members.campaign_id = adventures.campaign_id and campaign_members.profile_id = auth.uid()::text)
  );
create policy adventures_insert_own on adventures for insert
  with check (exists (select 1 from campaigns where campaigns.id = adventures.campaign_id and campaigns.owner_profile_id = auth.uid()::text));
create policy adventures_update_own on adventures for update
  using (exists (select 1 from campaigns where campaigns.id = adventures.campaign_id and campaigns.owner_profile_id = auth.uid()::text));
create policy adventures_delete_own on adventures for delete
  using (exists (select 1 from campaigns where campaigns.id = adventures.campaign_id and campaigns.owner_profile_id = auth.uid()::text));

alter table environments enable row level security;
create policy environments_select_own_or_member on environments for select
  using (
    exists (select 1 from campaigns where campaigns.id = environments.campaign_id and campaigns.owner_profile_id = auth.uid()::text)
    or exists (select 1 from campaign_members where campaign_members.campaign_id = environments.campaign_id and campaign_members.profile_id = auth.uid()::text)
  );
create policy environments_insert_own on environments for insert
  with check (exists (select 1 from campaigns where campaigns.id = environments.campaign_id and campaigns.owner_profile_id = auth.uid()::text));
create policy environments_update_own on environments for update
  using (exists (select 1 from campaigns where campaigns.id = environments.campaign_id and campaigns.owner_profile_id = auth.uid()::text));
create policy environments_delete_own on environments for delete
  using (exists (select 1 from campaigns where campaigns.id = environments.campaign_id and campaigns.owner_profile_id = auth.uid()::text));

alter table situations enable row level security;
create policy situations_all_own on situations for all
  using (exists (select 1 from campaigns where campaigns.id = situations.campaign_id and campaigns.owner_profile_id = auth.uid()::text))
  with check (exists (select 1 from campaigns where campaigns.id = situations.campaign_id and campaigns.owner_profile_id = auth.uid()::text));

alter table clues enable row level security;
create policy clues_all_own on clues for all
  using (exists (select 1 from campaigns where campaigns.id = clues.campaign_id and campaigns.owner_profile_id = auth.uid()::text))
  with check (exists (select 1 from campaigns where campaigns.id = clues.campaign_id and campaigns.owner_profile_id = auth.uid()::text));

alter table visual_assets enable row level security;
create policy visual_assets_all_own on visual_assets for all
  using (exists (select 1 from campaigns where campaigns.id = visual_assets.campaign_id and campaigns.owner_profile_id = auth.uid()::text))
  with check (exists (select 1 from campaigns where campaigns.id = visual_assets.campaign_id and campaigns.owner_profile_id = auth.uid()::text));

alter table equipment_catalog enable row level security;
create policy equipment_catalog_all_own on equipment_catalog for all
  using (exists (select 1 from campaigns where campaigns.id = equipment_catalog.campaign_id and campaigns.owner_profile_id = auth.uid()::text))
  with check (exists (select 1 from campaigns where campaigns.id = equipment_catalog.campaign_id and campaigns.owner_profile_id = auth.uid()::text));

alter table character_equipment enable row level security;
create policy character_equipment_all_own on character_equipment for all
  using (exists (
    select 1 from characters
    left join campaigns on campaigns.id = characters.campaign_id
    where characters.id = character_equipment.character_id
      and (characters.owner_profile_id = auth.uid()::text or campaigns.owner_profile_id = auth.uid()::text)
  ))
  with check (exists (
    select 1 from characters
    left join campaigns on campaigns.id = characters.campaign_id
    where characters.id = character_equipment.character_id
      and (characters.owner_profile_id = auth.uid()::text or campaigns.owner_profile_id = auth.uid()::text)
  ));
