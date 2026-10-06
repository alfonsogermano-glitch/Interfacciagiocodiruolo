# Audit salvataggi Cloud / Locale

Data: 2026-10-06. Analisi iniziale dei percorsi client, servizi e chiamate dirette;
stato aggiornato al termine dell'allineamento (punto 67 del WORKLOG).

## Esito

`DashboardSettings.saveMode` (`local` | `cloud`) è ora l'interruttore che sceglie
l'archivio di **contenuto**: in Locale tutte le letture/scritture/cancellazioni e
gli upload dei contenuti di gioco finiscono in IndexedDB sul dispositivo
(`hollowgate-selected-content:<accountId>`), in Cloud su Supabase. Il routing è
esplicito: `src/services/storage/contentFetch.ts` è installato come `fetch`
globale del client Supabase (`src/lib/supabaseClient.ts`) e come `fetch` dei
servizi che parlano agli endpoint server, quindi nessun percorso di contenuto
bypassa la scelta. In Locale non viene aperta nessuna connessione Realtime e non
vengono fatte chiamate di contenuto a Supabase (verificato dal test
`scripts/verify-selected-storage.mjs`, inserito in `npm run check`).

I dati locali sono separati per account: archivio IndexedDB per account, chiavi
localStorage di contenuto con prefisso `persistenceKey(<chiave>:<owner>:<mode>)`,
preferenze dashboard già scorate per owner. Il cambio di modalità ricarica la
pagina (`App.tsx`) così nessun componente resta con metà stato vecchio.

Resta esplicito che **il cambio di archivio non migra i dati**: selezionare
Locale non sposta su Supabase ciò che era in cloud e viceversa (l'unica
ereditarietà implementata è quella descritta sotto per i documenti campagna).

## Copertura (stato dopo l'allineamento)

| Area | Stato | Percorsi |
| --- | --- | --- |
| Campagne (CRUD, apertura, conteggi, cache elenco) | Allineato | `CampaignContext.tsx`, `CampaignHome.tsx`, `CampaignsPage.tsx` via `contentFetch`; endpoint server gestiti da `localCampaignApi.ts` in Locale. |
| Note, tab, contenuti, cestino, icone titolo | Allineato | `useEntityTabs.ts`, `useNotesTrash.ts`, `entityNotesService.ts`, `noteTitleIconService.ts` via `contentFetch`; RPC `set_entity_note_title_icon` locale. |
| Cartelle e spostamenti | Allineato | `foldersService.ts` + `useFolderSection`/`useFolderDragDrop` via `contentFetch`. |
| Personaggi (PG propri, GM, condivisione) | Allineato per i CRUD | CRUD via `contentFetch`; **claim/release/assegnazione/invito restano cloud-only** (in Locale ritornano errore esplicito). |
| Entità (PNG, mostri, luoghi, indizi, situazioni, avventure) | Allineato | `entitiesService.ts` sempre via `supabase.from(...)` → `contentFetch`; fallback storico `hsc_local_entities:*` scorchato per account/modalità. |
| Componenti GM che leggevano localStorage (Clues/Situations/Adventure/Environment/NPC/PlayerCharacters/SceneEncounter/monstersUtils) | Allineato | Lettura/scrittura tramite servizi (archivio selezionato); i mirror localStorage residui sono scorchati con `persistenceKey`. |
| Catalogo equipaggiamento e equipaggiamento del personaggio | Allineato | `equipmentCatalogService.ts` (`equipment_catalog`) e `characterEquipmentService.ts` (`character_equipment`, schema relazionale `CharacterEquipmentRow`/`mapCharacterEquipmentRow`, `upsert on_conflict=id`, `catalog_item_id` nullo per gli id sintetici standard, fallback ai vecchi payload in Locale) via `contentFetch`; migration `supabase/20261006220000_character_equipment.sql` (colonne `quantity`/`custom_data`, check `location` a 5 valori, policy con cast a `text`). Nota: il pannello collegato a `characterEquipmentService` (`features/equipment`) non è ancora importato dall'UI; l'equipaggiamento mostrato in sessione vive in `character.equipment`, già allineato con i personaggi. |
| Formule dadi, cartelle formule, dadi custom, stili standard | Allineato | `diceFormulasService`/`diceFormulaFoldersService`/`diceCustomDiceService`/`diceStandardStyleService` via `contentFetch`; RPC dadi locali in `localRest.ts`. |
| Chat e tiri nella timeline | Allineato | `chatService.ts` via `supabase.from('chat_messages')` → `contentFetch` (upsert idempotente per `ignoreDuplicates`); "visto" in localStorage scorchato. |
| Documenti campagna (mappa, combattimento, incontro attivo) | Allineato con ereditarietà | `campaign_documents` (`contentFetch` + tabella locale) con `useCampaignDocument`: al primo accesso eredita `gdr-dashboard-maps`, `gdr-dashboard-combat`, `hsc_active_encounter` e rimuove la chiave vecchia dopo il primo salvataggio riuscito. Richiede `supabase/20261006221000_campaign_documents.sql`. |
| Risorse visuali e upload immagini | Allineato | `visualAssetsStorage.ts` (Supabase/IndexedDB/Tauri) e `uploadContentAsset`/`removeContentAsset` (`contentAssets.ts`): in Locale immagini salvate come data-URL nell'archivio locale, in Cloud su Storage. |
| Preferenze dashboard | Allineato | `dashboardSettings.ts`: local-first per owner; in Locale nessuna scrittura cloud, in Cloud il `saveMode` resta la preferenza del dispositivo. |
| Realtime (canali campagna e profilo) | Allineato | `campaignChannel.ts`: in Locale nessuna connessione, i canali sono locali (`setReady` immediato, `send` = dispatch locale); `supabase.channel` diretto in `PlayerCharacters`, `MyCharactersPage`, `CampaignsPage` è disattivato in Locale. |
| Notifiche | Allineato | `NotificationsContext.tsx`: in Locale elenco vuoto e nessuna chiamata; risposta agli inviti dichiara "richiede Cloud". |
| Tiro segreto al GM | Allineato | `DiceSessionContext.dispatchRoll` esce in Locale (nessuna chiamata al relay `dice-secret-roll`). |
| Upload avatar e profilo | Cloud (account) | `SettingsModal.tsx`: bucket `avatars` + tabella `profiles` sono dati dell'account, non contenuto di campagna. |
| Account, autenticazione, ruoli, amministrazione | Cloud (account) | `AuthContext`, `adminUsersService` (RPC `admin_list_users`/`admin_set_user_role`), nessuna scrittura locale. |
| Inviti, adesioni, join con codice | Cloud-only | `useJoinByCodeFlow`, `CampaignContext.joinCampaign`, anteprime invito: in Locale ritornano errore esplicito. |
| Notizie e segnalazione bug | Cloud | `NewsPage.tsx` (bucket `news-images`), `ReportBugModal.tsx`: servizi di piattaforma. |
| Preferenze UI (dimensioni pannelli, dadi 3D, alberi espansi) | Locali per progetto | Non sono contenuti condivisi di campagna; restano in localStorage anche in modalità Cloud. |
| Backup campagna (export/import file) | Legacy | `campaignBackupService.ts` (nessun UI collegato) legge/scrive solo i mirror localStorage scorchati. |

## Verifiche

- `scripts/verify-selected-storage.mjs` (in `npm run check`): CRUD per ogni tabella
  di contenuto, note ricche + cestino/ripristino/purga, RPC dadi, tiri chat
  idempotenti, 25 scritture concorrenti, riapertura con un secondo client,
  isolamento account/modalità, zero chiamate cloud in Locale, invito che fallisce
  in Locale, transazione abortita senza scritture parziali, documenti campagna con
  `on_conflict`, invio cloud in Cloud con metodo/corpo preservati.
- `npm run check` completo (typecheck + verify + build) verde.
- Resta consigliata una verifica a occhio in browser (DevTools Network) nelle due
  modalità su un account reale, soprattutto dopo il cambio modalità.

## Ruoli e futuri abbonamenti

La gestione attuale modifica solo l'autorizzazione applicativa (`admin`/`standard`).
Eventuali livelli Gold, Premium o Fast potranno essere aggiunti con una migrazione
e relativo supporto UI. Un livello di abbonamento è preferibilmente un attributo
separato dal ruolo amministrativo: Premium non deve implicare accesso ai comandi
di amministrazione e un amministratore può avere anche un piano commerciale.
