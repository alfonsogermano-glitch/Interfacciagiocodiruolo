# Recupero Hollowgate: inventario operativo del 21 novembre 2026

**Non è una certificazione di parità né un'autorizzazione al deploy.**
Ricognizione del codice locale corrente, test locali ripetuti e sole GET
pubbliche. Nessun SQL remoto, modifica servizi, commit o push in questa
lavorazione. Conservati i precedenti documenti e le modifiche non committate.

## Regole delle evidenze

- **Presente nel codice**: percorso realmente montato dall'entrypoint Aruba;
  non basta che un componente esista nel repository.
- **Test locale passato**: vale per la suite/fixture indicata, non per il VPS.
- **Pubblico verificato**: osservazione HTTP o flusso umano esplicitamente
  riportato, con limiti chiari. Un HTTP 200 non dimostra il funzionamento del
  modulo né i permessi di lettura/scrittura.
- **Incompleto**: adattatore disabilitato, workflow assente o dipendenze non
  allineate. **Non verificato** non vuol dire **assente**.
- Baseline originale: `src/app/App.tsx` e componenti sorgente correnti;
  esistono molte modifiche locali, quindi non è una snapshot storica immutabile.
  Conservare struttura/comportamento originali; nero/oro e Phosphor Duotone
  restano le sole variazioni estetiche già ammesse.

## Risultati ripetuti adesso

| Controllo | Esito | Che cosa NON certifica |
|---|---|---|
| `npm test` in `apps/aruba-api` | **264/264**, nessuno skip/fallimento | PostgreSQL live, provider e rete reali |
| `npm test` in `apps/aruba-vtt-pilot` | **473/473**, nessuno skip/fallimento | intero sito in browser, parità visuale, VPS |
| Nuovo inventario sorgente, `node --test deploy/aruba/qa/recovery-source-inventory.test.mjs` | **4/4** | dipendenze SQL complete o schema installato |
| `node deploy/aruba/qa/verify-full-parity-audit.mjs` | **FAIL: 2 contraddizioni nei gate** | non va trasformato in PASS ritoccando i booleani |
| GET pubbliche `/`, `/login`, `/signup`, `/forgot-password`, `/account/password`, `/account/verify-email`, `/vtt/`, `/ready` | **200, TLS valido** | invio email, autenticazione e CRUD non sono provati dalle GET |
| GET pubbliche `/privacy`, `/elimina-dati`, `/news` | **404, TLS valido** | i componenti esistono nell'originale, non sono recuperati nelle route pubbliche |

### Stato auth già verificato durante il rilascio

Google e Discord: due nuove identità distinte nello **staging**, accessi
ripetuti e ritorno VTT confermati dall'utente. In **produzione**, l'utente ha
confermato accesso email/password, collegamento esplicito dal menu
nome utente → Impostazioni → Collega Google/Discord e successivo logout/login
con entrambi sullo stesso account. Non ripetere questi test per cercare di
dimostrare un'altra funzione. Il caso nuovo utente produzione e la consegna
reale dell'email di registrazione/attivazione restano separatamente da chiudere.
Non collegare account esistenti per sola uguaglianza dell'email.

Backup/clone della rehearsal auth: `63|54|9` (utenti/campagne/visual asset),
riportati dall'utente prima del live auth. Dati storici: verifica precedente
339/339 record, 9/9 visual asset e 70/70 media storici. **Non sono conteggi
riacquisiti in questo audit**, non provano l'accesso UI di ogni ruolo e non
vanno usati per affermare che nessun nuovo account sia stato creato dopo.

## Matrice del sito: implementazione ≠ funzionamento pubblico

Le sorgenti Aruba sono sotto `apps/aruba-vtt-pilot/src/` salvo altra indicazione.
Per ogni riga non qualificata come verificata, lo stato pubblico rimane
**non verificato in questo audit**; le feature flag del file example NON
costituiscono la configurazione live.

| Area originale | Percorso Aruba corrente | Stato e lacuna concreta |
|---|---|---|
| Landing e autenticazione | `apps/aruba-auth-web/{index.trial.html,app.mjs,flow.mjs}`, API auth | Pubblicati; accesso proprietario e link social confermati. Consegna email/password nuova da chiudere |
| Privacy e cancellazione dati | Originale `App.tsx` → `PrivacyPolicy`, `DeleteData` | **Assenti dalle route pubbliche (404)**; recuperare pagine originali e i link effettivi, non pagine inventate |
| News e novità | Originale `App.tsx` → `NewsPage`; TopBar apre `/news` | **Route pubblica 404**; determinare separatamente sorgente dei contenuti e autorizzazioni |
| Shell, barre, menu | `main.tsx` monta `AppShell`, `LeftSidebar`, `TopBar` originali e rail adattate | Presente/test locale; impostazioni complete e workflow globali non equivalenti |
| Panoramica | `main.tsx`, `HomeRecentCampaign` | Presentazione adattata, azioni capability-gated. Non certificata visivamente in questo audit |
| Campagne possedute | `ArubaCampaignsPage`, `ArubaCampaignHome`, `campaign-service.mjs` | CRUD e branding implementati; 54 campagne storiche non sono prova di visibilità di ogni account |
| Invito con codice | `ArubaCampaignInvites`, `campaign-invite-service.mjs`, SQL 033 | **Staging bloccato** da schema membership mancante + flag unset; codice/test locali presenti, test umano non eseguito |
| Inviti/notifiche originali | `ArubaOriginalTopBarAdapter.useNotifications` | **Incompleti**: lista vuota e azioni che generano errore. Non confondere con l'invito tramite codice |
| Campagne raggiunte da giocatore | `main.tsx`, `player-character-service.mjs` | Legate alla capability `playerCharacters`, non solo a `campaignInvites`; servono schema, grant e feature chain coerenti |
| Catalogo Personaggi | `ArubaCharacterDrafts` | PG caricati dalle campagne possedute; creazione richiede campagna HSC selezionata. Non equivale al catalogo globale/non assegnato originale |
| Tab globali PNG/Mostri | `ArubaCharacterDrafts` | **Placeholder esplicito**; nonostante gli archivi per campagna sottostanti siano implementati |
| Schede, disponibilità, assegnazione, claim | `ArubaCampaignPlayerRows`, `ArubaCharacterDetailPanel`, `ArubaAssignedCharacterPanel` | Trasporti e controlli locali presenti; dipendenze 016/026–034 e permessi reali da verificare per ambiente |
| Scheda PG, ritratto, token | `EntityDetailView` originale con adattatori, `ArubaCharacterImageEditor` | Recupero parziale: percorsi media/test presenti ma alias Vite escludono servizi/azioni non migrati |
| Capitoli/Scene | `ArubaChapterSceneEditor`, servizi chapter/scene | CRUD e grafo presenti; modello e presentazione adattati, non certificazione UI/public live |
| PNG/Mostri/Indizi/Eventi per campagna | `ArubaNarrativeManager`, `ArubaNarrativeDetailPanel` | CRUD e contesto presenti; distinti dal catalogo globale. Test contro dati/ruoli reali ancora da associare alla release |
| Preparazione/Incontri | `ArubaSceneEncounterManager`, `ArubaSessionEncounterPanel` | Componenti originali/adattati presenti; richiedono capitoli, scene, narrativa e/o documenti |
| Oggetti | `ArubaEquipmentCatalog` | CRUD e media implementati; collegamenti ricchi e flusso originale completo da confrontare |
| Note di campagna | `ArubaNotesRoute`, boundary originale e SQL 015–025 | **Doppio gate build/runtime**: senza `HG_CAMPAIGN_NOTES_CONTRACT=1` Vite monta `ArubaOriginalNotesDisabled`, anche con flag backend attivo |
| Note scheda/narrativa | client entity/narrative notes e `ArubaNoteRuntime` | Rich text presente; upload immagini generico e strumenti dipendenti da custom dice restano bloccati nell'adattatore |
| Mappa/sessione GM e giocatore | `ArubaOriginalSessionWorkspace`, `ArubaOriginalPlayerSessionWorkspace`, `ArubaGmLiveScene` | Implementazione locale e test controllati consistenti; readiness richiede bootstrap, WSS, TURN e DataChannel verificato. Reti pubbliche/Android non certificati |
| Combattimento/Fasi | `ArubaOriginalCombatTracker`, `ArubaOriginalGamePhases` | Componenti originali con persistenza documentale; non prova multiplayer/end-to-end reale |
| Chat pubblica/privata, reazioni, allegati | `ArubaSessionChatPanel`, adattatori Aruba chat | Componenti originali e API presenti; percorso legato a capability e campagna. Non certificato sul pubblico adesso |
| Dadi e formule | `ArubaQuickDice`, `ArubaChatDiceSession`, servizi formule | Motore originale riusato; **custom dice/cartelle formule disabilitati** in `ArubaNoteRuntime` |
| Aspetto dadi/3D | `ArubaDiceAppearanceContext` | Default soltanto; `saveStyles` genera errore. Non confondere tiro rapido funzionante con recupero completo di skin/3D |
| Asset/branding | `ArubaOriginalVisualAssets`, `ArubaVisualAssetsStorage`, `ArubaCampaignBranding` | Storage Aruba e componenti originali presenti; matrice consumer e permessi player da verificare sul bundle/DB destinazione |
| Profilo e preferenze complete | `main.tsx.openAccountSettings` | **Incompleti**: avviso e link social; non monta `SettingsModal` originale né persiste dashboard settings |
| Segnala bug | `main.tsx.onReportBug` | **Incompleto**: solo avviso; originale montava `ReportBugModal` |

## Dipendenze SQL: cosa mancava veramente nello staging

Letture fornite dall'utente sullo staging: DB `hollowgate_auth_test`, inviti
`unset`, tabella inviti e tre routine assenti. La rehearsal è arrivata al
clone e si è fermata prima di scrivere SQL allo staging vivo: la funzione
di 033 provava una scrittura in `campaign_members`, assente. **Non basta
installare 033 e attivare un flag.**

Catena riscontrata nei sorgenti:

```text
001 utenti + 008 campagne
  └─ 015 campaign_notes
       └─ 016 campaign_members + campaign_member_role
            ├─ 026 roster
            ├─ 028 assegnazioni (richiede anche bozze/schede/disponibilità)
            │    └─ 029 lettura schede giocatore
            ├─ 030 lista campagne giocatore
            └─ 033 inviti
037: riallineamento grant del solo login staging, dopo migration appropriate
```

016 dipende anche dalle Note perché dichiara `list_member_campaign_notes`
in linguaggio SQL; il VTT inoltre chiama `list_joined_player_campaigns`
tramite `playerCharacters`, che in `index.mjs` richiede assegnazioni, roster,
disponibilità e personaggi. Questo accoppiamento va affrontato esplicitamente,
non nascosto da un toggle. La catena sopra è una selezione **non un installer**.

Lo scanner nuovo trova **55 sorgenti migration**, **27 file API con riferimenti
SQL**, **30 flag auth** e tre flag build. Genera dipendenze delle relazioni
e una query catalogo read-only per confrontare gli ambienti; non risolve
overload, corpi funzione, colonne, ACL o dipendenze SQL dinamiche.
Numeri uguali in sottodirectory diverse NON stabiliscono un ordine globale.

Lo script storico `scripts/activate-vtt-campaigns.sh` applica solo 008–012,
usa il vecchio ruolo e ricrea il gateway: **non usarlo per riallineare lo
staging attuale**. Non rilanciare gli script inviti precedenti: i clone/backup
di diagnosi sono già presenti. Non copiare il DB produzione sopra lo staging:
cancellerebbe o mescolerebbe le nuove identità social QA.

## Contraddizioni documentali da non promuovere a certificazione

`full-parity-contract.json` imposta alcuni gate true, mentre il verificatore
pretende ancora false per `visualBaselineApproved` e
`browserRealApiDatabasePassed`. Il controllo fallisce proprio per questo,
non per un errore di sintassi applicativo. Altre note del contratto descrivono
ancora account bloccati o una voce Note aggiunta ormai non rappresentativa
del flusso reale. I report «certificato locale» restano documenti storici,
non prove di equivalenza completa sul VPS.

`verify-code-parity.mjs` non confronta realmente due copie dei componenti
critici: in quella sezione verifica soprattutto esistenza/lunghezza. Non
usarne l'eventuale PASS per affermare identità funzionale o visuale.
In questa ricognizione **non sono stati cambiati i gate storici**.

## Sequenza di recupero proposta, senza autorizzazioni implicite

1. **Inventario schema/flag/build per ambiente**, con query read-only e
   output privo di utenti/segreti. Provare prima i controlli su clone locale
   o dedicato; trasformarli in un gate ripetibile. Non basta lo schema example.
2. **Pagine pubbliche originali mancanti**: privacy/cancellazione e news.
   Preparare un piccolo bundle di sole pagine con test dei link, nessun
   cambio di login o SQL. Ogni pubblicazione richiede approvazione precisa.
3. **Primo flusso gioco completo**: proprietario crea/apre campagna → invito
   → partecipazione player → stessa campagna visibile al player → revoca.
   Prima risolvere schema e accoppiamento capability sul clone; poi staging
   con identità QA già presenti, infine prova browser reale. Non iniziare
   con sessione realtime o mappa 3D.
4. **Schede e contenuti**: assegnazione/claim PG e cataloghi globali, poi
   Note e contenuti narrativi originali; ogni verticale comprende persistenza,
   permessi, refresh e revisione visuale prima del rilascio.
5. **Sessioni live**: chat, mappa, combattimento, dadi/skin/3D e TURN pubblico
   come milestone distinte. Provare revoca/riconnessione e reti diverse.
6. **Servizi globali**: impostazioni/profilo, notifiche e segnalazione bug,
   senza fingere che gli stub siano funzioni recuperate.

Non stimare una percentuale di completamento da file/test. Non toccare UI,
dati, SQL o produzione solo per rendere verde un report. Il comando di
rilascio è l'ultima fase di un bundle già collaudato, non il posto dove
scoprire dipendenze mancanti. All'utente non servono altri copia-incolla per
la presente ricognizione. Registrazione email/password pubblica resta una
verifica di consegna umana: non inviare posta a terzi per certificarla.

## Come ripetere l'inventario (a cura dell'operatore)

```text
node deploy/aruba/qa/recovery-source-inventory.mjs
node deploy/aruba/qa/recovery-source-inventory.mjs --schema-probe
node --test deploy/aruba/qa/recovery-source-inventory.test.mjs
```

Il primo comando emette JSON su stdout, il secondo SQL **di sola lettura**
da revisionare: nessuno dei due si collega al database. Il probe catalogo
misura presenza per nome, NON confronto di signature/ACL/definizioni; non
può ancora promuovere alcun deploy o dire che tutti i dati siano accessibili.
