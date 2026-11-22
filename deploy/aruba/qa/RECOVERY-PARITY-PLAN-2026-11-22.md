# Recupero integrale del sito originale: piano ed evidenze

Richiesta del proprietario: copia completa del vecchio sito su Aruba, non una
versione semplificata. **Lavoro in corso, parità non raggiunta.**

## Baseline e regole

- Vecchio codice conservato dal tag `archive/legacy-pre-aruba-20261122`
  (`e9f31ab6`), foundation conservata separatamente (`531c7484`). La struttura
  originale attualmente condivisa resta in `src/app/App.tsx` e nei componenti
  originali: confrontare anche il tag prima di cambiare una sorgente condivisa.
- Sviluppo sul branch `tmp/aruba-transition-20261122`; nessun merge su main,
  force push o eliminazione del vecchio codice durante la transizione.
- Riutilizzare il componente originale quando possibile. Cambiare trasporto
  e persistenza dietro un confine esplicito Aruba, non sostituire controlli e
  workflow con una schermata ridotta che ha soltanto le stesse etichette.
- Sole differenze estetiche approvate: nero/oro e Phosphor Duotone. Copia dei
  testi legali adeguata ai provider/infrastruttura realmente utilizzati, senza
  dichiarare Supabase o Facebook attivi quando non lo sono.
- Nessun Supabase runtime su Aruba, nessun dato fittizio nel sito operativo,
  nessun collegamento automatico di account per email, nessun vecchio dump
  restaurato sopra dati correnti. Non indebolire i controlli GM/giocatore.
- Sito Aruba e staging **non sono specchi di dati/configurazione**. I test
  automatici possono usare fixture/clone; l'accettazione funzionale dell'utente
  si fa una volta su Aruba, non ripetendo lo stesso giro manuale sullo staging.
- Ogni rilascio resta distinto dal commit/push e richiede perimetro preciso,
  backup, preflight e rollback. Non caricare un intero workspace sul VPS.

## Cosa significa «recuperato»

Per ciascun flusso: stessi ingressi, controlli, menu, pannelli, modali, campi,
filtri e azioni originali; dati storici e nuovi leggibili; scrittura persistita
e riletta dopo refresh; autorizzazioni owner/player e revoca provate; errori
espliciti; media reali. Confronto visuale a 360/390/768/1280/1440/1920px contro
baseline originale, con sole differenze approvate. Real-time e TURN richiedono
anche reti differenti, non solo loopback.

Test unitari o fixture browser non promuovono lo stato a verificato pubblico.
I gate di parità storici attualmente contraddittori non vanno ritoccati per
ottenere un PASS. Non calcolare percentuali dal numero di file o test.

## Sequenza di recupero completa

| Ordine | Area / sorgente originale | Lavoro da chiudere prima di dichiarare parità |
|---|---|---|
| 1 | Affidabilità caricamento + pagine `src/app/legal/*` | Pagine legali pubblicate e verificate; fix caricamento/inviti VTT preparati, non pubblicati |
| 2 | `MyCharactersPage.tsx`, `charactersService`, `entitiesService` | Catalogo globale completo PG/PNG/Mostri, non placeholder: ricerca, filtri gerarchici campagna/capitolo e regole, paginazione, creazione, duplicazione/copia, assegnazione/distacco, disponibilità/claim/release, archivio e schede originali. Verificare proprietà logica dei PG vs proprietà fisica GM, dati storici senza campagna e ogni copia delle note/media. Nessun «0» o pulsante disabilitato inventato |
| 3 | `SettingsModal`, `dashboardSettings`, `ReportBugModal`, notifiche originali | Ripristinare modali e salvataggio reale di profilo/preferenze, impostazioni dashboard, notifiche/inviti originali e segnalazioni. Conservare link OAuth espliciti già funzionanti; niente account collegati per email |
| 4 | `HomeScreen`, `CampaignsPage`, `CampaignHome`, `App.tsx` | Stessa navigazione e azioni; ripristino della vista/tab dopo F5 come nell'originale (non confondere con persistenza dei dati); creazione/modifica/branding, inviti, adesione e revoca con vecchi account e dati attuali |
| 5 | `EntityDetailView`, editor schede, immagine/token, note rich text | Ogni campo/scheda delle regole supportate e ogni azione originale, upload/crop/originale/cornici/cover, media GM/player, salvataggi serializzati e chiusura sicura; nessun URL Supabase rimasto nei consumer Aruba |
| 6 | `ChapterManager`, editor scene, `SceneEncounterManager`, PNG/Mostri/Indizi/Eventi | CRUD e grafo originali, link e pannelli contestuali, ordinamento e selezione ripetuta, creazione/modifica completa dei contenuti e media; verificare la UI non solo i modelli JSON |
| 7 | `EquipmentCatalogPage`, `VisualAssetsManager` | Catalogo completo con collegamenti e modali originali; upload/formati/miniature/cartelle/consumer immagini, permessi e revoca reali, tutti i media storici |
| 8 | Note campagna/sessione e sottoschede | Albero cartelle originale, scope GM/condiviso, rich text e allegati, spostamento/ordine, trash/ripristino; allineare flag di build e runtime. Non aggiungere una voce navigazione diversa dall'originale |
| 9 | `SessionWorkspace`, `SessionRightSidebar`, chat, combat, fasi e mappa | Montare i workspace originali completi, non solo i pannelli disponibili. Persistenza, fog/light/vision/token/layer, ingresso/uscita/riconnessione GM/player, chat privata/pubblica/allegati/reazioni, combattimento/fasi, autorizzazioni e isolamento |
| 10 | Dadi originali, formule, skin/3D e cartelle | Recuperare anche personalizzazione e persistenza: oggi alcuni adattatori forniscono solo default o generano errore. Motore tiro funzionante non equivale a dadi completi |
| 11 | `NewsPage.tsx` | Route pubblica e contenuti reali con immagini, composizione/pubblicazione/eliminazione admin autorizzata dal server. Non esporre un Supabase client o usare solo un ID admin hardcoded nel browser. I 339 record della migrazione storica non provano il recupero di news/posts |
| 12 | Verifica finale integrata | Confronto schermata/azione/ruolo, test non distruttivi su dati storici e nuovi, Firefox/Chromium/mobile, TURN e Android su reti reali, navigazione e stato dopo refresh, nessun placeholder/stub o gate senza prova. Solo qui valutare la parità completa |

## Tranche A: implementata e provata, con stato distinto per flusso

**Aggiornamento attuale:** soltanto Privacy / Elimina dati sono pubblicate e
verificate in HTTPS. Le correzioni di caricamento campagne/inviti del VTT
restano nel codice condiviso, non incluse nel rilascio statico.

### Caricamento campagne e inviti

- `campaign-collections.mjs`: letture indipendenti con `Promise.allSettled`.
  Una lista in errore non cancella l'altra letta con successo; nessuna cache
  persistente di dati precedenti. Errori espliciti e dati puliti al cambio
  identità/capability. Un 401 su una lista invalida entrambe.
- `client.mjs`: risposta HTML/SPA non viene accettata come JSON campagne.
  Solo il preciso 404 JSON di rifiuto invito genera «codice non valido o
  scaduto». 404 statici, route assenti e JSON malformato sono errori tecnici;
  nessun codice invito o corpo server viene riportato negli errori.
- Browser integrato, bundle Vite reale e server fixture loopback senza DB:
  campagna posseduta presente dopo F5 con player-route 404; lista giocatore
  presente con owner-route 503; entrambe assenti con 401; dialogo distingue
  errore tecnico HTML da rifiuto API JSON. La prima fixture basata su Referer
  è stata corretta perché il frontend shipping usa giustamente no-referrer;
  non è stata indebolita la policy reale.

### Pagine originali Privacy / Elimina dati

- `apps/aruba-public-web/build.mjs` importa e renderizza gli stessi componenti
  originali in HTML statico: nessuna ricostruzione parallela e nessun JS/API
  richiesto dal visitatore. Layout inline originale conservato.
- `PrivacyPolicy` mantiene i default originali per il vecchio sito; Aruba
  passa i fatti correnti (Aruba/PostgreSQL, Google/Discord e data aggiornata).
  `DeleteData.tsx` non modificato.
- Manifest con SHA-256 di sorgenti e HTML. Link originali home/mail/privacy.
- CSS globale originale compilato e incluso nello stesso HTML: Preflight,
  margini e tipografia non vengono approssimati con gli stili default del
  browser. Hash del corpo JSX normalizzato e degli stili inline confrontati
  con la baseline archiviata `e9f31ab6`, non con il candidato Aruba stesso.
- Browser reale: titoli, testi Aruba, link e assenza script verificati.
  Rendering in iframe same-origin a 360/390/768/1280/1440/1920px senza overflow
  per entrambe le pagine. Non è approvazione pixel/manuale dell'intero sito.
- `prepare-public-legal-routes.py`: aggiunge solo un blocco nel sito www della
  copia live di Caddy. Preserva byte per byte staging, auth/API, apex e altri
  percorsi. Rifiuta file staging-only locali, vecchio cutover o patch ripetute.
  **Il Caddyfile locale auth-trial non rappresenta il gateway condiviso vivo:
  non caricarlo come sostituzione.**

### Rilascio ancora da preparare/autorizzare

Il frontend VTT attuale di produzione non è automaticamente uguale al
checkpoint: prima di aggiornare il bundle, confrontare commit/manifest e flag
di build per evitare di pubblicare involontariamente altre funzioni WIP.
Per questo la correzione campagne **non è automaticamente distribuibile**
solo perché passa la build locale. Le pagine statiche possono invece essere
rilasciate separatamente senza sostituire il VTT.

Il rilascio legale deve copiare soltanto i due HTML in una nuova directory
`site-pages` nel bind web pubblico reale, generare il candidato dalla copia
Caddy live, validarlo dentro il Caddy effettivo prima del reload, conservare
inode/config originale e rollback. Nessun SQL, rotazione OAuth, ricreazione
API/gateway o rimozione di media. Verificare HTTPS di pagine, login, VTT,
readiness e staging; non considerare la sola GET 200 un test di login completo.

Docker Desktop locale non è attivo: la validazione Caddy reale resta un gate
di preflight, non è stata certificata dai soli test Python del generatore.

### Verifiche ripetute della tranche A

- VTT: 485/485 test passati, nessuno skip. I due vecchi test che cercavano la
  chiamata diretta nel main ora seguono il vero loader e mantengono i controlli
  di selezione autorizzata; le nuove regressioni verificano i risultati reali.
- Pagine originali: 2/2 test passati (baseline archiviata + build HTML/CSS).
- Generatore route: 4/4 Python passati. Applicato anche alla copia completa
  del Caddyfile live scaricata in sola lettura: esattamente un blocco aggiunto,
  ogni byte preesistente preservato. Hash copia prima
  `05b06f6da2b655f5c3248cbd54fee0cd3f9a2ce06259766502bbce40b757603b`,
  candidato `b5ac1260525018dd32044fafc7560fb9406f518dbdb2f1cf897f449f81d99d11`.
  Nessun upload/applicazione sul VPS in questa lavorazione.
- TypeScript originale e build VTT passati. Workflow GitHub dedicato solo
  test, senza secret di rilascio o deploy.
- Dopo l'inclusione del CSS originale, rendering browser ripetuto per le due
  pagine alle sei larghezze: nessun overflow, h1 line-height 48px e margin-top
  0px come base originale; zero script. Si tratta di iframe same-origin,
  non di un test Android reale né di approvazione visiva dell'intero sito.

## Aggiornamento: rilascio delle sole pagine legali autorizzato

Il proprietario ha autorizzato la pubblicazione di Privacy / Elimina dati con
backup e reload del gateway pubblico, escludendo VTT/API/database/OAuth/staging.
Runner, input e guardie in `../production/PUBLIC-LEGAL-RELEASE.md`.

La rehearsal Caddy mancante sopra è ora stata eseguita con Caddy Linux 2.10.2
ufficiale come utente non-root su porte effimere loopback: validazione, route
404→200 con hash HTML esatti, HEAD, vecchie route immutate e rollback 200→404
passati. Processo temporaneo terminato, nessun servizio Docker o file attivo
modificato. La verifica COMPLETA nel gateway pubblico rimane un gate obbligatorio
del runner prima delle modifiche vive.

Diciassette test di flusso del runner passati (26/26 nella suite production),
incluse interruzioni, guasti e rifiuto di sovrascrivere modifiche indipendenti.
Pacchetto caricato e hash verificati sul VPS; marker ricevuto dall'agente:
`PUBLIC_LEGAL_BUNDLE_VERIFIED_NOT_APPLIED`.

**Applicazione ancora da eseguire tramite sudo dell'operatore.** Non considerare
le due pagine pubblicate prima di `PUBLIC_LEGAL_RELEASE_OK` e riscontro HTTPS.
Le correzioni frontend di campagne/inviti restano su GitHub, non vengono
incluse automaticamente in questo rilascio statico.

### Primo tentativo legale: non riuscito, rollback OK

Esito utente: preflight e reload passati, confronto del contenuto HTTPS
fallito, rollback precedente riuscito. Pagine ancora non pubblicate.
Readiness/login esterni 200 e route legali 404 confermati dopo il rollback.
Conservare work e risposta HTTPS privati, acquisire soltanto diagnosi
sanitizzata. Trasformazione CDN/email è un'ipotesi non ancora provata; non
promuovere il rilascio o allentare il gate. Dettagli nel runbook legale.

### V2 preparata dopo diagnosi Cloudflare

L'utente conferma CSS identico, email offuscate e uno script di decodifica
Cloudflare nella risposta HTTPS salvata; config precedente ripristinata.
V2: no-transform confinato alle due route legali, HTML invariato e confronto
esatto mantenuto, più verifica degli header finali. Nessuna impostazione
globale CDN modificata. Nuovi percorsi v2, evidenze/backup V1 conservati.

22 test del runner e 5 del generatore passati; Caddy reale non-root conferma
GET/HEAD, header confinato, hash esatti e rollback su porte temporanee. La
prova non attraversa Cloudflare: il gate HTTPS vivo resta obbligatorio.
V2 non ancora applicata; dettagli e pin in
`../production/PUBLIC-LEGAL-RELEASE-V2.md`. Nessuna correzione VTT inclusa.

### Esito successivo: V2 legale pubblicata e verificata

L'utente ha riportato `PUBLIC_LEGAL_RELEASE_OK` con invarianti superate.
Verifica esterna dell'agente: entrambe le pagine 200 text/html, titoli originali,
header no-transform, zero script/offuscazione Cloudflare. Hash pubblici
identici ai due HTML preparati, confermati via seconda GET HTTPS dal VPS.
Readiness/login/VTT 200, header confinato ai due URL, config staging isolata
invariata. Dettagli e digest nel runbook V2.

Nessun deploy frontend VTT/API/SQL/OAuth. Non richiedere all'utente di ripetere
i test staging/produzione per queste pagine statiche già verificate.
Prossima verticale sostanziale: catalogo globale completo PG/PNG/Mostri
(ordine 2 sopra), da confrontare con il componente originale e non sostituire
con un ulteriore elenco semplificato. Parità complessiva ancora non raggiunta.
