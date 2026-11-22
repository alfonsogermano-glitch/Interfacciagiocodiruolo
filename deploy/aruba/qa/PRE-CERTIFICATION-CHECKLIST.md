# Checklist finale di pre-certificazione Aruba VTT

Questa checklist separa le evidenze locali già verdi dalle prove che richiedono PostgreSQL, staging o dispositivi reali. Nessun esito locale autorizza deploy o cutover.

## 1. Baseline locale già verde

| Blocco | Comando/evidenza | Criterio PASS | Stato |
|---|---|---|---|
| API | `cd apps/aruba-api; npm test` | 247 test verdi | PASS locale |
| Pilot | `cd apps/aruba-vtt-pilot; npm test` | 469 test verdi (con formule dadi salvate) | PASS locale |
| Build pilot | `cd apps/aruba-vtt-pilot; npm run build` | build completata; nessun endpoint Supabase nel bundle | PASS locale |
| Canale shipping | `node apps/aruba-vtt-pilot/test/browser-shipping-campaign-channel.mjs` | WSS, ICE, DataChannel, revisioni, reconnect e revoca verdi | PASS controllato |
| UI Sessione/Mappa | `node apps/aruba-vtt-pilot/test/browser-shipping-session-map-ui.mjs` | GM/player, readiness, revoca, 24 PNG e zero overflow | PASS controllato |
| UI claiming reale | `node apps/aruba-vtt-pilot/test/browser-character-claim-real-db.mjs` | Chromium GM + due player, claim, grouping, modifica, ritratto, asset, release, race con lock DB, revoca membership e rifiuto scritture stale su PostgreSQL reale | PASS controllato |
| Placement Scene | `node apps/aruba-vtt-pilot/test/browser-scene-placement-real-db.mjs` | Chromium sulla superficie originale Capitoli/Scene, assegnazione a Scene, reload PostgreSQL e ritorno al Capitolo | PASS controllato |
| Sessione combinata reale | `node apps/aruba-vtt-pilot/test/browser-combined-session-real-db.mjs` | Chromium GM+player, HTTPS locale reale, API Aruba reali, PostgreSQL usa-e-getta, WSS/ICE/DataChannel reali, bootstrap, pannelli Incontri/Combatti originali, pubblicazione Capitolo/Scena, refresh/reconnect, revoca membership, deny owner-only | PASS controllato |
| Inventario | `node deploy/aruba/qa/verify-full-parity-audit.mjs` | inventario valido, cutover non certificato | PASS inventario |
| Navigazione | `node deploy/aruba/qa/verify-session-navigation-contract.mjs` | contratto sorgente valido, release bloccata | PASS inventario |
| Diff | `git diff --check` | nessun errore | PASS locale |
| Narrativa | `cd apps/aruba-api; npm test -- test/narrative-*.test.mjs` | 8/8 test narrative PASS (6 content-SQL + 2 entity-notes) | PASS locale aggiunto |
| Visual comparison | `deploy/aruba/qa/visual-comparison/` | Manifest + report HTML generati; 6 viewport screenshot catturati; differenze deliberate (palette nero/oro, icone Phosphor Duotone) confermate; `approved: false`, `layoutDiffReviewed: false` con evidence revisione | Revisione documentale completata |

## 2. Gap applicativi ancora aperti

Questi elementi non sono prove infrastrutturali e devono essere risolti o formalmente esclusi dal contratto prima della certificazione:

- `owner-only-campaign-list`: risolto e verificato con account GM/player, API e PostgreSQL reali, inclusa race tra due player e revoca membership;
- `contextual-character-open`: risolto; PNG/Mostri aprono il dettaglio originale e il placement Scene è verificato in Chromium sulla superficie originale Capitoli/Scene con PostgreSQL reale. Solo Environment, posizioni mappa e cartelle restano esclusi e fail-closed;
- Note/chat e superfici ancora marcate `parziale` o `divergente` nell’inventario;
- rimuovere i placeholder generici soltanto quando esiste la funzione reale corrispondente; in alternativa lasciare il comando non disponibile, senza simulazioni.

**PASS:** `node deploy/aruba/qa/verify-session-navigation-contract.mjs --release` non segnala route irrisolte e tutti gli elementi applicativi del full-parity contract sono `verificato` con evidenza.

Il claiming deve inoltre soddisfare tutti i boundary atomici di `deploy/aruba/qa/character-claim-contract.json`. Verifica inventario con `node deploy/aruba/qa/verify-character-claim-contract.mjs`; la modalità `--release` deve restare rossa finché SQL, API, UI, revoca e race PostgreSQL/browser non sono tutti realmente provati.

Il dettaglio contestuale PNG/Mostri soddisfa `deploy/aruba/qa/narrative-entity-detail-contract.json` (stato `verified`). Eseguire `node deploy/aruba/qa/verify-narrative-entity-detail-contract.mjs`: media, asset referenziati, note custom, Chapter/Scene placement e campi semantici sono verificati in Chromium con PostgreSQL reale; Environment, posizioni mappa e cartelle restano rifiutati e disabilitati.

**Stato locale completato:** narrative entity notes SQL schema creato (002_narrative_entity_notes.sql), API validateArubaNarrativeMedia() implementata, UI tab notes-narrative montata in EntityDetailView write-disabled, character-claims tab montata write-disabled, contract boundary character-claims-ui aggiunto. Tutti i boundary contrattuali sono marcati `implemented-unverified` con evidenza documentata.

La race SQL riproducibile è predisposta in `deploy/aruba/scripts/test-character-claim-race.sh` ed è collegata al job PostgreSQL CI. Il solo controllo statico o la presenza nel workflow non costituiscono evidenza di esecuzione.

**Stato visual comparison:** screenshot 6 viewport catturati, manifest.json + report.html generati; differenze deliberate (palette nero/oro, icone Phosphor Duotone) confermate con revisione documentale; `approved: false`, `layoutDiffReviewed: false` con evidence annotata; differenze strutturali mappate per successivi interventi.

## 3. Configurazione capability `.env`

Prerequisito: il file `.env` nella root di `apps/aruba-api` (ancora non creato di default).

La migrazione è progettata per essere **opt-in** tramite flag ambientali. Fino a quando non si impostano `AUTH_VTT_*=true`, tutte le feature sono **disabilitate** (fail-closed). Di seguito la mappatura completa desunta da `apps/aruba-api/src/index.mjs` (linee 97-274):

| Flag | Corrispondente | Richiede | Stato attuale |
|---|---|---|---|
| `AUTH_VTT_CAMPAIGNS_ENABLED` | `createCampaignService` | migration 008 | `false` (off) |
| `AUTH_VTT_CHAPTERS_ENABLED` | `createChapterService` | campaigns + migration 010 | `false` (off) |
| `AUTH_VTT_SCENES_ENABLED` | `createSceneService` | chapters + migration 011 | `false` (off) |
| `AUTH_VTT_NARRATIVE_CONTENT_ENABLED` | `createNarrativeContentService` | scenes + migration 012 | `false` (off) |
| `AUTH_VTT_ENTITY_NOTES_ENABLED` | `createEntityNotesService` | characters + migration 013 | `false` (off) |
| `AUTH_VTT_NARRATIVE_ENTITY_NOTES_ENABLED` | `createNarrativeEntityNotesService` | narrative content + `narrative/002_narrative_entity_notes.sql` | `false` (off) |
| `AUTH_VTT_CAMPAIGN_NOTES_ENABLED` | `createCampaignNotesService` | entityNotes + migration 014 | `false` (off) |
| `AUTH_VTT_CAMPAIGN_NOTE_FOLDERS_ENABLED` | `createCampaignFoldersService` | notes + migration 017 | `false` (off) |
| `AUTH_VTT_EQUIPMENT_CATALOG_ENABLED` | `createEquipmentCatalogService` | campaigns | `false` (off) |
| `AUTH_VTT_VISUAL_ASSETS_ENABLED` | `createVisualAssetService` | campaigns | `false` (off) |
| `AUTH_VTT_CAMPAIGN_ROSTER_ENABLED` | `createCampaignRosterService` | campaigns + migration 026 | `false` (off) |
| `AUTH_VTT_CHARACTERS_ENABLED` | `createCharacterService` | campaigns | `false` (off) |
| `AUTH_VTT_CHARACTER_AVAILABILITY_ENABLED` | `createCharacterAvailabilityService` | migration 027 | `false` (off) |
| `AUTH_VTT_CHARACTER_ASSIGNMENTS_ENABLED` | `createCharacterAssignmentService` | characters + roster + availability | `false` (off) |
| `AUTH_VTT_PLAYER_CHARACTERS_ENABLED` | `createPlayerCharacterService` | assignments | `false` (off) |
| `AUTH_VTT_CHARACTER_CLAIMS_ENABLED` | `createCharacterClaimService` | playerCharacters + characterAssignments | `false` (off) |
| `AUTH_VTT_CHARACTER_PORTRAITS_ENABLED` | `createCharacterPortraitService` | characters + assignments | `false` (off) |
| `AUTH_VTT_SIGNALING_ENABLED` | - | - | `false` (off) |
| `AUTH_VTT_TURN_ENABLED` | - | - | `false` (off) |
| `AUTH_VTT_GAME_SESSION_ENABLED` | - | - | `false` (off) |
| `AUTH_VTT_ORIGINAL_NOTES_PANEL_ENABLED` | - | - | `false` (off) |
| `AUTH_VTT_CAMPAIGN_NOTE_FOLDERS_ENABLED` | - | - | `false` (off) |
| `AUTH_VTT_CAMPAIGN_CHAT_ENABLED` | `createCampaignChatService` | campaigns + migration `chat/001_campaign_chat.sql` + `chat/002_chat_attachments.sql` | `false` (off) |
| `AUTH_VTT_DICE_FORMULAS_ENABLED` | `createDiceFormulaService` | campaigns + migration `dice/001_dice_formulas.sql` | `false` (off) |

**Comportamento fail-closed:** Quando tutte le flag sono `false` (default):
- Tutte le route `POST/PUT/DELETE` relative alle feature disabilitate restituiscono 404 (route non registrate)
- L'UI mostra messaggi "Attivare capability X per scrivere/claimare"
- I gate `--release` rimangono bloccati
- I test unitari locali passano comunque (sono isolati dalle feature flag)

**Per abilitare una o più feature:**
1. Copiare `.env.example` (se esistente) o creare `.env` nella root di `apps/aruba-api`
2. Impostare le flag desiderate su `true`, rispettando le dipendenze (es. `AUTH_VTT_CHARACTER_CLAIMS_ENABLED=true` richiede `AUTH_VTT_PLAYER_CHARACTERS_ENABLED=true` e `AUTH_VTT_CHARACTER_ASSIGNMENTS_ENABLED=true`)
3. Eseguire `npm test` per confermare l'invarianza locale
4. Solo allora considerare l'esecuzione di `verify-session-navigation-contract.mjs --release`

**Nota:** Il file `.env` non è presente in questo repository; deve essere creato dall'operatore in base alle esigenze di staging. Il modello consigliato è disabilitare tutto di default e attivare solo le feature richieste per lo scenario di test.

## 4. Confronto visuale originale / Aruba

Seguire `deploy/aruba/qa/VISUAL-COMPARISON.md` con due origin distinti, fixture controllate identiche e i sei viewport contrattuali.

**Evidenza:** manifest, 12 coppie PNG per superficie, diff review firmata e motivazione per ogni differenza deliberata (solo palette nero/oro e icone Phosphor Duotone già approvate).  
**PASS:** nessun difetto non deliberato di geometria, contenuto, responsive, focus, overlay o overflow; approvazione manuale registrata. Solo allora impostare `visualBaselineApproved` e `layoutDiffReviewed` a `true`.

## 5. Account, ruoli e riconciliazione reali

- usare almeno due account staging distinti, GM e player;
- verificare email canonica, membership, campagne owned/joined, assegnazioni, revoca e recupero accesso;
- confrontare inventario Supabase con Aruba senza copiare password o cancellare account;
- provare accesso negato a campagne, documenti, asset e inviti estranei.

**Evidenza:** matrice anonimizzata utente→ruolo→campagna, richieste di rete e risultati DB/API.  
**PASS:** nessun utente mancante/duplicato, nessun privilegio ereditato erroneamente e revoca effettiva. Solo allora promuovere `allRolesVerified` e `accountReconciliationVerified`.

## 6. TURN pubblico e reti/dispositivi reali

- GM desktop su una rete e player Android su rete distinta (Wi‑Fi/5G);
- credenziali TURN effimere emesse dal servizio Aruba;
- verificare via `getStats()` una candidate pair `relay`, TLS/certificati, scadenza credenziali, reconnect e revoca;
- ripetere con firewall/NAT reali e conservare log privi di segreti.

**PASS:** collegamento e riconnessione funzionano su reti fisicamente distinte, credenziali errate/scadute falliscono e la revoca interrompe il player. Solo allora promuovere `networkGMPlayerVerified`.

## 7. Browser + API + database combinati

Eseguire lo scenario completo su staging isolato con API e PostgreSQL reali: login, campagna, invito, join, Sessione, Mappa, modifica GM, proiezione player, refresh, reconnect e revoca.

**Evidenza:** trace browser, log API correlati, query di controllo DB e screenshot dei sei viewport.  
**PASS locale (reale):** `node apps/aruba-vtt-pilot/test/browser-combined-session-real-db.mjs` ha PASSATO su Chromium reale, API Aruba reali, PostgreSQL usa-e-getta, WSS/ICE/DataChannel reali, bootstrap GM/player, sessione live, pubblicazione Capitolo/Scena, refresh/reconnect player, revoca membership e deny owner-only. Il combined real session ora `true` nel contratto di navigazione.  
**PASS finale:** nessuna fixture in-memory, nessun endpoint owner dal player, persistenza dopo refresh e revoca fail-closed. `browserRealApiDatabasePassed` resta `false` fino allo staging con account reali GM/player; `combinedBrowserRealDatabaseSession` resta promosso solo sulla prova reale combinata completata.

## 8. Rollback drill

Su staging isolato:

1. creare backup DB e artefatti/configurazione correnti;
2. applicare la release candidata senza toccare Vercel/Supabase;
3. eseguire smoke test GM/player;
4. ripristinare artefatto, configurazione e database precedenti secondo il piano;
5. ripetere smoke test e verificare integrità dati;
6. registrare tempi, operatore, hash backup e risultato.

**PASS:** rollback entro il tempo concordato, nessuna perdita dati e servizi precedenti pienamente operativi. Solo allora promuovere `finalRollbackDrillPassed`.

## 9. Gate conclusivo

Eseguire:

```bash
node deploy/aruba/qa/verify-session-navigation-contract.mjs --release
node deploy/aruba/qa/verify-full-parity-audit.mjs --release
```

**PASS finale:** entrambi codice 0, tutti i record `verificato`, tutti i dieci gate `acceptance` a `true`, evidenze archiviate e approvazione manuale esplicita. Fino ad allora staging e produzione restano invariati e il cutover è vietato.
