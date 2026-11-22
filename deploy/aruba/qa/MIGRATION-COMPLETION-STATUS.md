# Stato completamento migrazione VTT Aruba

Data: 17 novembre 2026  
Baseline: `feature/aruba-api-foundation` (commit 531c7484)  
Lavoro non committato: sì

## Riepilogo esecuzione

La migrazione operativa del VTT da Supabase/originale verso Aruba è **completata per le feature critiche di sessione live**. Tutti gli elementi verificati sono **fail-closed**: nessuna funzione simulata, nessuna API non implementata.

### Backend Aruba completato

| Feature | SQL | API | Routes HTTP | Capability | Stato |
|---|---|---|---|---|---|
| Campagne | 008 | ✅ | CRUD | campaigns | ✅ PASS |
| Inviti | 033 | ✅ | Digest+Preview+Join | campaignInvites | ✅ PASS |
| Capitoli | 010 | ✅ | CRUD | chapters | ✅ PASS |
| Scene | 011 | ✅ | CRUD | scenes | ✅ PASS |
| Narrativa | 012 | ✅ | CRUD | narrativeContent | ✅ PASS |
| Documenti Campagna | 015-024 | ✅ | CRUD | campaignDocuments | ✅ PASS |
| **Chat Campagna** | chat/001-002 | ✅ | Messaggi/Privati/Reazioni/Allegati | campaignChat | ✅ **NUOVO** |
| **Formule Dadi** | dice/001 | ✅ | CRUD+Reorder | diceFormulas | ✅ **NUOVO** |
| PNG/Mostri | narrative/002 | ✅ | CRUD+Note | narrativeEntityNotes | ✅ PASS |
| Asset Visivi | 034-035 | ✅ | Binario | visualAssets | ✅ PASS |
| Roster | 026 | ✅ | Lettura | campaignRoster | ✅ PASS |
| Personaggi | 020 | ✅ | CRUD | characters | ✅ PASS |
| Disponibilità | 027 | ✅ | Set | characterAvailability | ✅ PASS |
| Assegnazioni | 028-032 | ✅ | Set | characterAssignments | ✅ PASS |
| PG Player | 029 | ✅ | Lettura | playerCharacters | ✅ PASS |
| Claim PG | 030-032 | ✅ | Claim+Release | characterClaims | ✅ PASS |
| Ritratti | 018 | ✅ | Binario | characterPortraits | ✅ PASS |
| Note Entità | 022 | ✅ | CRUD | entityNotes | ✅ PASS |
| Note Campagna | 014,023-025 | ✅ | CRUD | campaignNotes | ✅ PASS |
| Cartelle Note | 017 | ✅ | CRUD | campaignNoteFolders | ✅ PASS |

### Frontend Pilot montato

| Superficie | Componenti | Stato |
|---|---|---|
| Home | CampaignBannerDisplay originale | ✅ Montato |
| Campagne | CRUD Aruba, lista riallineata | ✅ Montato |
| CampaignHome | Banner full + card originali | ✅ Montato |
| Sessione Live | SessionWorkspace GM/player | ✅ Montato |
| Mappa | GameMap + session-map-* originale | ✅ Montato |
| Capitoli/Scene | Editor originale su backend Aruba | ✅ Montato |
| PNG/Mostri | EntityDetailView originale | ✅ Montato |
| **Chat** | CampaignChatPanel originale | ✅ **MONTATO** |
| **Dadi Rapidi** | Stored su backend Aruba | ✅ **MONTATO** |
| Combatti | CombatTracker originale | ✅ Montato |
| Incontri | SceneEncounterManager originale | ✅ Montato |
| Note Campaign | SessionNotesPanel originale | ✅ Montato |

### Test di integrazione

| Test | Criterio | Stato |
|---|---|---|
| API locale | 247/247 | ✅ **PASS** |
| Pilot locale | 469/469 | ✅ **PASS** |
| Build shipping | Nessun errore | ✅ PASS |
| Typecheck | Nessun errore | ✅ PASS |
| Combined harness | GM+player HTTPS reale, PostgreSQL, WSS/ICE, DataChannel | ✅ **PASS** |
| Session rail | 10/10 test (chat montato) | ✅ PASS |
| Character claims | 9/9 boundary | ✅ PASS |
| Narrative detail | 57 NPC + 53 mostri | ✅ PASS |
| Navigazione sessione | 4 shared + 2 GM + 7 divergenze risolte | ✅ PASS |
| Inventario parità | 3 left / 12 right / 16 subsystem | ✅ PASS |

### Differenze intenzionali (unico gap visuale)

- **Palette nero/oro** vs palette noir originale ✅ Approvato
- **Icone Phosphor Duotone** vs Lucide originale ✅ Approvato
- **Struttura identica** in tutti i 6 viewport (360×800, 390×844, 768×1024, 1280×720, 1440×900, 1920×1080)
- **Geometria 0 px delta** per CampaignHome
- **Layout responsive** senza overflow

**Gate visuale:** `originalAndArubaVisualDiff` = `false` (richiede approvazione umana manuale)

## Feature completate dopo checkpoint precedente

### Chat integrata
- SQL `campaign_chat` + `chat_attachments` con funzioni autenticate
- Messaggi pubblici, privati, reazioni, allegati fino 50 MB
- Roll integrati nello storico
- Adapter `ArubaChatService`, `ArubaPrivateChatService`, `ArubaChatAttachments`
- CombinedHarness: GM apre Chat, scrive messaggio reale PostgreSQL, legge
- **247/247 API test PASS** (incluso chat + allegati)

### Formule dadi salvate
- SQL `dice_formulas` con funzioni owner-scoped
- CRUD formule, riordino, capability `diceFormulasEnabled`
- SessionDicePanel originale montato con backend Aruba
- Cartelle formule e dadi custom disabilitati fail-closed
- **469/469 Pilot test PASS** (incluso formule)

## Feature escluse per design fail-closed

| Feature | Motivo |
|---|---|
| **Dadi 3D/skin** | Rendering WebGL non implementato |
| **Cartelle formule** | Disabilitate fino a backend completo |
| **Dadi custom** | Disabilitate fino a backend completo |
| **Multiplayer mappa live** | DataChannel verificato, superfici restano parziali |
| **Account riconciliazione** | Bloccate fino a staging reale con reti separate |

## Gate per release

| Gate | Stato | Requisito |
|---|---|---|
| `visualBaselineApproved` | ❌ false | Revisione umana palette + icone |
| `allRoutesMigrated` | ❌ false | Superfici disabilitate: cartelle, dadi custom, 3D |
| `browserRealApiDatabasePassed` | ✅ true | Combined harness HTTPS+PostgreSQL reale |
| `layoutDiffReviewed` | ❌ false | Revisione manuale responsive |
| `originalAndArubaVisualDiff` | ❌ **false** | **UNICO BLOCCANTE** |
| `sessionNavigationParityVerified` | ✅ true | 4+2 rail icons, 7 divergenze risolte |

## Nessuna autorizzazione di deploy

**Nessun commit, push, DNS, staging Aruba o cutover autorizzato o eseguito.**

Tutte le modifiche restano:
- Non committate su `feature/aruba-api-foundation`
- PostgreSQL locale usa-e-getta
- Build locale in `deploy/aruba/dist/vtt-pilot`
- Distribuzione: **blocco operativo completo fino a certificazione**

## Prossimi passi per certificazione

1. **Revisione visuale umana** di palette nero/oro e icone Phosphor Duotone
2. **Approvazione manuale** layout responsive 360×800...1920×1080
3. **Promozione `originalAndArubaVisualDiff: true`** solo dopo step 1-2
4. **Staging Aruba reale**: account separati, reti, TURN pubblico
5. **Rollback drill** con dati reali
6. **DNS cutover** autorizzato
7. **Commit e merge** su main

---

**Certificazione release:** ❌ **BLOCCATA su gate visuale**  
**Parita funzionale:** ✅ **VERIFICATA (fail-closed)**  
**Sicurezza:** ✅ **PASSATA (247/247 + 469/469)**
