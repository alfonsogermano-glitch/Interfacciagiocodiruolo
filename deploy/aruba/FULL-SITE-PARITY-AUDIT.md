# Audit generale e parità 100% — Hollowgate VTT, prerequisito al cutover Aruba

**Stato: APERTO / NON CERTIFICATO.** Repository `alfonsogermano-glitch/Interfacciagiocodiruolo`. Baseline: codice sorgente originale in `src/app/**`, non le schermate dimostrative del pilot. Aruba: PR #52, ramo `feature/aruba-api-foundation`. Data della prima ricognizione: 12 novembre 2026.

> Politica di rilascio vincolante: nessuna attivazione intermedia del sito. Staging pubblico e produzione restano invariati fino a un'unica attivazione finale, consentita soltanto dopo certificazione di parità grafica e funzionale al 100%.

Aggiornamento 15 novembre 2026: il percorso reale del pilot monta ora l'editor Aruba Capitoli/Scene con modelli originali, CRUD e grafo PostgreSQL/API, mappa con griglia e regioni, ciclo visualizzazione/modifica/salva/annulla e Chromium E2E con rilettura autorevole. I Contenuti narrativi dispongono ora di API cookie-only, PostgreSQL owner-only e transizioni verificate tra contesto generale, Capitolo e Scena. Il blocco resta **parziale**, non completo: `GameMap` e confronto visivo multi-viewport non sono ancora migrati/certificati.

Aggiornamento archivi narrativi: le route reali PNG, Mostri e Indizi montano ora un archivio Aruba capability-gated con ricerca e CRUD completo; Chromium verifica creazione e cancellazione PNG insieme alle assegnazioni Capitolo/Scena. Restano parziali finché schede avanzate, catalogo Mostri, media/token e confronto visivo non raggiungono la baseline originale.

Aggiornamento Preparazione: la route `scene-encounter` legge ora esclusivamente API Aruba per Capitoli, Scene e quattro gruppi narrativi, mantiene ordinamento e regole di collegamento originali e mostra anteprima mappa/regioni. Chromium verifica la selezione della Scena e i contenuti ereditati dal Capitolo. L'attivazione live resta separata e fail-closed.

Aggiornamento Schede: la route GM monta ora il roster Aruba verificato, le disponibilità e assegnazioni capability-gated e collega il dettaglio originale già adattato ad Aruba. Chromium certifica roster, disponibilità e apertura del dettaglio originale; il blocco resta parziale in attesa di ruoli/account reali e confronto visivo.

Aggiornamento Eventi: la vecchia route Situazioni usa ora il tipo `events` del backend narrativo Aruba, con CRUD owner-only e campi titolo, innesco, descrizione, conseguenze e scelte/risultati. Chromium certifica il ciclo di persistenza; il confronto visivo resta aperto, quindi il blocco è parziale.

Aggiornamento Archivio Oggetti: la route monta un catalogo Aruba capability-gated con modello originale principale, ricerca, creazione, modifica ed eliminazione owner-only. Contratto, API HTTP, schema SQL, installer staging protetto, job PostgreSQL CI e Chromium CRUD sono presenti. Asset/media, collegamenti avanzati, confronto visuale e nuova esecuzione PostgreSQL locale restano aperti; nessuna capability è attiva per default.

Fondazione documenti campagna: aggiunti contratto bounded, API cookie-only, capability fail-closed, servizio owner-only e schema PostgreSQL per i documenti usati da Mappa, Combattimento e sessione. L’installer è protetto e la verifica SQL è inclusa nella CI PostgreSQL 17.

Aggiornamento Mappa: `GameMap` originale è ora montata tramite scope campagna e trasporto documentale Aruba isolati in build; il fallback Supabase e la migrazione da `localStorage` sono esclusi nel pilot. Chromium certifica creazione locazione, modifica nome, note e persistenza API. Tool mappa TopBar, workspace sessione, media, rete e confronto visuale restano aperti, quindi il blocco è parziale.

Aggiornamento Fasi di Gioco: `GamePhases` originale usa ora un documento campagna Aruba invece di stato volatile. Progressione, completamento delle fasi e note di sessione sono capability-gated e owner-only; Chromium certifica il ciclo di persistenza. Sessione multiplayer e confronto visuale restano aperti, quindi il blocco è parziale.

Aggiornamento Combattimento: `CombatTracker` originale è montato con documenti `combat` e `active-encounter` Aruba; l’import Mostri è isolato dal servizio Supabase e legge il backend narrativo owner-only. Chromium certifica aggiunta combattenti, avvio e avanzamento turno persistiti. Encounter live, multiplayer e confronto visuale restano aperti, quindi il blocco è parziale.

Aggiornamento Asset Grafici: `VisualAssetsManager` originale è montato tramite adapter Aruba senza Supabase o IndexedDB. Sorgente e thumbnail sono validate e persistite come `bytea` PostgreSQL owner-only; installer protetto, job CI, API cookie-only e Chromium upload/delete sono presenti. Integrazione di tutti i consumer media, PostgreSQL reale locale e confronto visuale restano aperti, quindi il blocco è parziale.

Aggiornamento responsive: Chromium cattura e valida la superficie Schede/dettaglio a 360×800, 390×844, 768×1024, 1280×720, 1440×900 e 1920×1080. Questo certifica rendering e accessibilità del comando di ritorno nei sei viewport, ma non sostituisce il confronto pixel/manuale con la baseline originale; `visualBaselineApproved` e `layoutDiffReviewed` restano correttamente `false`.

Preparazione confronto visuale: `apps/aruba-vtt-pilot/test/capture-visual-baseline.mjs` impone origin distinti, conferma esplicita del vero entrypoint originale, identico selettore di stato e i sei viewport contrattuali; genera coppie PNG e manifest SHA-256 mantenendo l'approvazione falsa. `vite.visual-baseline.config.ts` esegue il vero `src/main.tsx`/`App.tsx` con sole fixture locali Auth/Campaign; lo smoke Chromium blocca qualsiasi rete esterna. Resta da portare originale e Aruba alla medesima superficie/stato prima dell'acquisizione definitiva. Procedura in `deploy/aruba/qa/VISUAL-COMPARISON.md`.

Esito prima acquisizione comparativa: `deploy/aruba/qa/visual-comparison/` contiene 12 PNG autenticati, manifest SHA-256 e report affiancato/overlay per la home con identici utente e campagna. La divergenza è strutturale: home Aruba ricostruita, rail GM destra visibile in Panoramica, header e card campagne non equivalenti all'AppShell/HomeScreen originali. Nessun gate è promosso; `visualBaselineApproved` e `layoutDiffReviewed` restano `false`. La correzione richiesta è montare/adattare la superficie originale, non approvare lo scarto.

Prima correzione dal diff: la Panoramica Aruba non monta più la rail GM (ora limitata alle sole sezioni GM, come lo slot originale), il logo Hollowgate viene servito dal bundle `/vtt/` senza immagine rotta e TopBar mostra l'identità Aruba reale. Le 12 coppie sono state rigenerate. HomeScreen/card restano differenti e i gate visuali restano `false`.

Seconda correzione dal diff: la Panoramica monta ora il componente originale `CampaignBannerDisplay` in modalità compatta e mostra solo la campagna più recente, come `HomeScreen`; intestazioni, azioni rapide, spaziature `space-y-14`, altezza TopBar e geometria delle card seguono la sorgente originale. Il probe `apps/aruba-vtt-pilot/test/visual-geometry-probe.mjs` ha misurato box identici tra originale e Aruba a 1440×900 e 390×844 per header 48 px, hero 56 px, titoli a 28 px, card 420×156 / 242×176, banner 1292×205,3 / 242×41,2 e logo 92 px. Restano deliberate la palette nero/oro e le icone Phosphor Duotone; nessun gate visuale è promosso e le altre superfici non sono ancora confrontate. Le evidenze JSON del probe sono in `deploy/aruba/qa/visual-comparison/geometry-1440x900.json` e `geometry-390x844.json`.

Verifica della correzione rail: la rail GM resta assente da Panoramica e Personaggi e compare su Campagne solo dopo la selezione di una campagna attiva, ripristinando l'accesso transitorio alle sezioni GM usato dal test E2E. La build di produzione, i 408 test (`node --test test/*.test.mjs`) e il test Chromium Capitoli/Scene con sei viewport passano; le 12 coppie di screenshot sono state rigenerate dalla build corrente. `visualBaselineApproved` e `layoutDiffReviewed` restano `false`.

Integrazione Asset Grafici - immagini oggetto: l'Archivio Oggetti Aruba carica gli asset `item-image` della campagna, mostra la miniatura nell'elenco e nel dettaglio, consente di associare un asset esistente o caricarne uno nuovo (canvas client-side per sorgente e miniatura) e salva `imageAssetId` nell'oggetto. Tutto passa da `visualAssetsStorage` Aruba e dalle route cookie-only; con `visualAssets` disabilitato il selettore e l'upload non vengono montati. Il Chromium E2E carica l'immagine, salva l'oggetto con l'asset e verifica che la cornice successiva condivida lo stesso archivio.

Integrazione Asset Grafici - cornici e copertine entità: la sezione Immagine della scheda PG monta l'originale `EntityImageExtras` (selettori cornice portrait/cover, `PortraitCropFrame`, `CoverFrame`, editor copertina) senza riscriverne la UI. I trasporti legacy sono inerti: `AuthContext`, `supabaseClient` e `contentAssets` sono sostituiti da un runtime fail-closed; l'elenco cornici usa `loadVisualAssetsByTypes` Aruba e l'URL content autenticato. Il cover base64 prodotto dal fallback originale viene intercettato prima del salvataggio, convertito in asset `other` (sorgente 1600 px + miniatura 256 px) e sostituito con l'URL `/vtt/campaigns/<c>/visual-assets/<id>/content`; nessun `data:image/` raggiunge `sheetData`. Con `visualAssets` disabilitato cornici e copertina non vengono montate. Il Chromium E2E seleziona una cornice, verifica il salvataggio di `coverFrameAssetId`, carica la copertina, controlla l'asset `other` e l'URL content persistito. Il tab Token usa l'originale `TokenStyleEditor` senza trasporti legacy; l'E2E modifica il colore e verifica il salvataggio di `tokenColor`. Il content endpoint è ora owner-or-player: un giocatore assegnato può leggere solo gli asset referenziati dalla propria scheda corrente (cornice ritratto, cornice cover, copertina nella stessa campagna), mentre list/save/remove restano owner-only.

Primo confronto visuale Campagne: `capture-visual-baseline.mjs` supporta ora `HG_VISUAL_SURFACE=campaigns`, con fixture Supabase controllate (`campaigns/overview` completa di `memberNames`/`memberCount`, `characters`, `member-names`) e file dedicati `campaigns-*.png`, `manifest-campaigns.json`, `report-campaigns.html`. La prima acquisizione a sei viewport ha mostrato una divergenza strutturale tra la `CampaignsPage` originale e la sezione Campagne custom: intestazione e sottotitolo diversi, filtri assenti, card verticale contro card orizzontale, tag regolamento e logo di default non equivalenti, nota aggiuntiva assente nell'originale. La sezione è stata quindi riallineata alla struttura originale con `ArubaCampaignsPage`: titolo `Campagne`, pulsante `Nuova Campagna`, quattro filtri (ordinamento, personaggio, regolamento, ricerca), card orizzontali da 156 px con logo 154 px, `RulesetTag` originale, tooltip partecipanti, collegamenti ai personaggi e piè di card con data. I dati arrivano dalle API Aruba (`/vtt/campaigns`, roster e personaggi); l'upload logo non esiste ancora nel backend Aruba ed è disabilitato, inviti e badge sessione non vengono inventati. Le 12 coppie rigenerate mostrano ora box coincidenti per intestazione, filtri e card a 1440×900 e 390×844; restano la palette nero/oro approvata e i controlli non migrati. Nessun gate è promosso: `visualBaselineApproved` e `layoutDiffReviewed` restano `false`, e `CampaignHome`/superficie sessione non sono ancora acquisite.

### Aggiornamento CampaignHome — 16 novembre 2026

Questo aggiornamento supera lo stato precedente «CampaignHome non ancora acquisita». La baseline è il vero entrypoint originale, con fixture controllate: l'assenza di `presenceState()` nel canale della fixture è stata corretta e la baseline ricostruita prima delle acquisizioni. Il primo confronto `campaignhome` mostrava il banner originale contro il placeholder Aruba «CONTESTO SESSIONE», senza cover, azioni, filtri o card GM equivalenti. L'errore dati Aruba nella prima cattura derivava da endpoint disponibilità/assegnazioni non intercettati dalla fixture, non da una verifica del backend reale.

`ArubaCampaignHome.tsx` sostituisce ora il placeholder e riusa `CampaignBannerDisplay` full, `FolderSectionHeader` ed `EntityCard` originali. Roster, personaggi, disponibilità, assegnazioni e PNG/Mostri provengono esclusivamente dalle API Aruba; lo snapshot roster/personaggi è validato atomicamente e gli errori non diventano elenchi vuoti attendibili. La lettura narrativa rimane owner-only. Filtri senza capability, copertina campagna, inviti e avvio sessione integrato restano disabilitati. Il menu campagna collega modifica nome/descrizione e gestione reali; la connessione GM sperimentale resta distinta dall'avvio sessione originale.

Acquisizione: `HG_VISUAL_SURFACE=campaignhome`, 12 PNG (6 coppie), `manifest-campaignhome.json`, `report-campaignhome.html` in `deploy/aruba/qa/visual-comparison/`. Le fixture usano ora lo stesso nome GM, senza cambiare la presentazione originale. Il manifest registra la geometria DOM: titolo, logo, card GM, intestazione Personaggi e colonne della griglia coincidono nei sei viewport 360×800, 390×844, 768×1024, 1280×720, 1440×900 e 1920×1080. Corretto il conflitto tra utility Tailwind del wizard e griglia `md:grid-cols-[320px_1fr]`; l'E2E verifica la colonna GM da 320 px su desktop.

Verifiche locali: build PASS, 410 test pilot PASS, Chromium CRUD/dettaglio più CampaignHome e sei viewport PASS, inclusi apertura precompilato, controlli disabilitati, ritorno gestione e rifiuto dello snapshot se la lettura assegnazioni fallisce. Non è parità completa: rimangono menu/workflow originali non migrati, dettaglio e cartelle PNG/Mostri, media campagna, sessione multiplayer integrata, account/ruoli reali e rete. Il clipping del banner/filtri nei viewport stretti esiste anche nella baseline ed è ancora un problema di usabilità, non un'approvazione responsive. `visualBaselineApproved` e `layoutDiffReviewed` restano `false`. Nessun commit, push, deploy o cutover.

Aggiornamento accesso giocatore — 16 novembre 2026: il percorso principale non limita più sidebar, lista Campagne e `CampaignHome` alle sole campagne possedute. Quando la capability `playerCharacters` è attiva, `/vtt/player-campaigns` alimenta l'elenco autorizzato e `/vtt/player-characters` alimenta esclusivamente le schede assegnate. Le campagne duplicate tra owner e joined vengono deduplicate privilegiando il record owner. `activeCampaignOwned` separa tutte le azioni GM: modifica campagna, rail GM, roster, disponibilità, assegnazioni, PNG/Mostri e trasporti owner non sono montati nel percorso player. La rail sessione player espone Schede/Dadi capability-gated senza Incontri/Combattimenti.

Il nuovo `ArubaPlayerCharacterDetail` riautorizza l'assegnazione prima di montare `EntityDetailView` originale in sola lettura (`canEdit=false`), non usa endpoint owner e non scrive. Il pannello Schede player può essere vincolato alla campagna attiva e verifica che la partecipazione esista ancora. Chromium dedicato certifica navigazione joined → CampaignHome, assenza dei controlli GM, zero richieste roster/personaggi owner-only, apertura read-only e blocco dopo revoca. Suite pilot: 412/412 PASS; API: 205/205 PASS. Restano da verificare account reali distinti, revoca concorrente/rete, media player (il fallback immagine resta neutro) e multiplayer; `allRolesVerified`, `networkGMPlayerVerified` e `sessionNavigationParityVerified` restano `false`.

Aggiornamento bootstrap multiplayer — 16 novembre 2026: il bootstrap opt-in compone ora membership `gm` dalle campagne possedute e `player` esclusivamente dalle campagne joined restituite dal servizio assegnazioni. Deduplica owner/joined privilegiando l'ownership e riverifica immediatamente ogni ruolo con `campaign_member_role` PostgreSQL prima di pubblicarlo; ruolo stale, ownership forgiata, liste malformate o oltre limite falliscono chiuso. Il client accetta soltanto i due ruoli verificati e la UI di connessione viene montata per GM o player solo quando la membership della campagna selezionata coincide col ruolo derivato dall'owner. Chromium player verifica il pannello `GIOCATORE`, l'assenza del comando GM e che nessun WebSocket venga aperto prima dell'azione esplicita. Mappe e strumenti originali non vengono attivati: resta una connessione sperimentale esplicita e capability-gated. Build PASS; suite pilot 414/414 PASS; API 208/208 PASS; Chromium GM/player PASS. Non essendo stato eseguito un collegamento reale contemporaneo tra due account e reti distinte, `networkGMPlayerVerified`, `allRolesVerified` e `sessionNavigationParityVerified` restano `false`.

Aggiornamento shell originale — 16 novembre 2026: il wrapper custom del pilot è stato sostituito dal vero `src/app/layout/AppShell.tsx`. LeftSidebar, TopBar, contenuto e rail destra sono ora forniti agli slot originali; `TooltipColorsProvider` e `PortalContainerContext` condividono quindi la stessa radice dell'app originale. Anche overlay, dettagli, modali e dadi restano children della shell e non fratelli esterni al provider. `AppShell` accetta classi di slot opzionali, con default vuoti, per conservare gli hook geometrici Aruba senza cambiare il comportamento dei chiamanti originali. Eliminato il `<main>` annidato emerso nel primo tentativo; Chromium verifica una sola landmark `main` e la gerarchia shell/sidebar/topbar/workspace. Build PASS, suite pilot 415/415 PASS, Chromium GM/player PASS e geometria CampaignHome 6/6 viewport invariata. Il sottosistema non è ancora marcato completo perché impostazioni dashboard persistite, revisione pixel/manuale e navigazione sessione integrale restano aperte; `visualBaselineApproved`, `layoutDiffReviewed` e `sessionNavigationParityVerified` restano `false`.

Aggiornamento workspace sessione originale — 16 novembre 2026: per l'owner con documenti campagna abilitati la route Mappa monta ora il vero `SessionWorkspace`, non più il solo `GameMap` legacy. Capitoli e Scene arrivano dalle API Aruba; la scena attiva è un documento backend `active-scene` esplicito e bounded; griglie, token, disegni, PDI, nebbia, ordine oggetti e posizionamenti usano i documenti originali `session-map-*`, accettati dal contratto API e persistiti per campagna. Chromium verifica la selezione della scena, la scrittura `active-scene`, l'attivazione di `Muovi` solo dopo il rendering della mappa e la persistenza dello snap griglia in `session-map-grids`. La TopBar originale riceve `sessionWorkspaceActive=true` soltanto in questo percorso owner; player e capability disabilitate restano sul `GameMap` legacy in sola visualizzazione, senza strumenti attivi. Il canale realtime della mappa resta esplicitamente `channelReady=false`: nessun WebSocket viene simulato e la sincronizzazione live GM/player resta P0 aperta. Corretto inoltre l'escaping di `validMediaUrl` nel Chapter/Scene editor, che rifiutava ogni URL HTTPS reale; un test di regressione copre URL validi, HTTP insicuro e host Supabase legacy.

Nuova regressione completa: build PASS, suite pilot **419/419 PASS**, API **210/210 PASS**, Chromium GM e player PASS, 12 PNG `campaignhome` rigenerati con geometria DOM coincidente in **6/6 viewport**. La shell monta il workspace dentro lo slot contenuto originale, ma lo slot diventa un `<div>` con le stesse classi quando il workspace possiede la propria landmark `<main>` (prop backward-compatible `contentAsMain`, default `true`): zero `<main>` annidati sia su CampaignHome sia sulla Mappa, con geometria invariata. La shell live originale (sidebar sinistra nascosta e `SessionRightSidebar` al posto della rail GM) resta non implementata e documentata come divergenza: la route Mappa Aruba è una route GM dashboard, non la vista sessione certificata. I gate `visualBaselineApproved`, `layoutDiffReviewed`, `allRolesVerified`, `networkGMPlayerVerified` e `sessionNavigationParityVerified` restano `false`; account reali distinti, sessioni simultanee, PostgreSQL locale, rollback drill e approvazione visuale manuale non sono stati eseguiti.

Aggiornamento media player - 16 novembre 2026: la lettura dei visual asset da parte del giocatore assegnato è ora reale e fail-closed. La migrazione `visual-assets/003_player_visual_asset_read.sql` espone `list_assigned_player_visual_assets` e `read_authorized_visual_asset`: la lista è composta solo dai metadati degli asset referenziati dalle schede correnti (`portraitFrameAssetId`, `coverFrameAssetId`, oppure la cover URL esatta `/vtt/campaigns/<campagna>/visual-assets/<id>/content` della stessa campagna); il content endpoint riusa la stessa autorizzazione e continua a servire l'owner. Membership revocata, scheda non disponibile/archiviata, asset non referenziato, campagna estranea, URL forgiato e accesso diretto alla tabella sono negati. Il client Aruba carica i metadati dopo la riautorizzazione della scheda, accetta solo URL content della campagna e id presenti nella lista, e `EntityDetailView` mostra cornice ritratto e `CoverFrame` in sola lettura senza controlli; con `visualAssets` disabilitato non monta alcun frame e non usa fallback legacy. Chromium verifica lista player, content autenticato dei tre asset referenziati, zero richieste alla lista owner, assenza di controlli e rimozione dei frame dopo la revoca. La CI PostgreSQL applica `003` e la regressione `test_player_visual_asset_read.sql` sia nel job capitoli sia nel job auth; la build pilot, la suite pilot **421/421** e la suite API **213/213** passano. Docker Desktop non era attivo, quindi l'esecuzione PostgreSQL reale locale resta aperta; account reali distinti, Android/rete e approvazione visuale restano non certificati. `mediaAnd3DVerified`, `allRolesVerified`, `networkGMPlayerVerified` e `visualBaselineApproved` restano `false`.

Aggiornamento branding campagna - 16 novembre 2026: logo e copertina campagna usano ora asset reali Aruba e riferimenti PostgreSQL, non stato simulato. La migrazione `visual-assets/004_campaign_branding.sql` aggiunge `logo_asset_id` e `cover_asset_id`, limita `set_owned_campaign_branding` all'owner e ad asset della stessa campagna, include i riferimenti nelle liste owner/player, consente la lettura content del branding ai membri correnti e pulisce i riferimenti prima della cancellazione asset. `test_campaign_branding.sql` copre set/lettura/clear, diniego player/outsider, asset estraneo, cancellazione selettiva e revoca membership. La route cookie-only e same-origin `PUT /vtt/campaigns/<id>/branding` aggiorna solo UUID o `null`; il client accetta esclusivamente URL content della stessa campagna. La UI riusa `ImageCropUploadModal`, salva sorgente PNG bounded e thumbnail nel visual-asset store e abilita i controlli solo con capability reali; lista Campagne e `CampaignHome` ricevono subito il record autorevole aggiornato. Build pilot PASS, suite pilot **423/423**, suite API **215/215**, Chromium GM/player/CampaignHome PASS. Docker/PostgreSQL locale, upload browser del cropper con database reale, confronto pixel/manuale, account e reti reali restano aperti; tutti i gate finali restano `false` e non è stato eseguito alcun deploy o cutover.

Inviti campagna - 16 novembre 2026: il backend introduce un solo codice attivo per campagna, casuale nel formato `HG-[A-F0-9]{20}`, mostrato in chiaro esclusivamente nella risposta di rotazione owner-only e conservato in PostgreSQL soltanto come digest SHA-256. La migrazione `033_vtt_campaign_invites.sql` applica scadenza, rotazione e join atomico nella membership player; utenti non verificati/disabilitati, owner, codici scaduti o sostituiti e accesso diretto della runtime alla tabella sono negati. Le route cookie-only `POST /vtt/campaigns/<id>/invite-code`, `GET /vtt/campaign-invites/preview` e `POST /vtt/campaign-invites/join` sono opt-in tramite `AUTH_VTT_CAMPAIGN_INVITES_ENABLED`; le mutazioni richiedono same-origin e l'identità deriva sempre dalla sessione. Bootstrap e client validano la capability in modo fail-closed; rotate/preview/join normalizzano esclusivamente il formato bounded, inviano solo il codice e rifiutano payload, owner o campagne forgiati. La UI capability-gated collega l'azione owner in `CampaignHome` e l'azione rapida player: il codice one-time resta soltanto nello stato del dialogo, la rotazione avvisa della revoca del precedente, il player vede un'anteprima prima della conferma e l'adesione non assegna personaggi. Chromium con fixture controllate verifica rotazione owner, rimozione del codice dal DOM alla chiusura, anteprima/join player e zero scritture personaggio. La regressione PostgreSQL è collegata alla CI ma non eseguita localmente perché Docker Desktop non è attivo; account/rete reali e browser contro PostgreSQL effettivo restano aperti, quindi nessun gate finale è promosso.

Blocco ingresso e shell sessione - 16 novembre 2026: `CampaignHome` controlla ora esplicitamente il trasporto sperimentale già esistente. “Avvia/Termina sessione” per l'owner e “Entra/Esci dalla sessione” per il player sono abilitati soltanto quando bootstrap, utente, campagna e ruolo coincidono esattamente con una membership server-verificata; cambiare campagna non riusa una richiesta precedente. Prima del click non viene aperto alcun WebSocket, il click apre il solo signaling autorizzato e l'uscita chiude la sessione. Durante la richiesta live la shell originale rimuove la sidebar dashboard sinistra e conserva la rail sessione destra; all'uscita ripristina la navigazione. Chromium con fixture controllate verifica separatamente GM e player, assenza di apertura implicita e transizione/ripristino della shell. Questo non certifica una sessione di gioco: `ArubaSessionCampaignChannel` continua a restituire `isReady:false`, il `SessionWorkspace` non usa il data channel e nessun evento mappa viene simulato. Restano necessari bridge eventi reale, workspace player read-only e due account distinti su rete reale; `networkGMPlayerVerified`, `allRolesVerified` e `sessionNavigationParityVerified` restano `false`.

Fondazione bridge canale campagna - 16 novembre 2026: `ArubaSessionCampaignChannel` non è più uno stub costante ma un adapter React verso `ArubaCampaignChannelRuntime`, registro transport-neutral isolato per UUID campagna. Le sottoscrizioni possono precedere l'installazione del trasporto, ma readiness e send restano falsi finché un binding verificato unico non viene installato e marca aperto il data channel esatto. Eventi sconosciuti, payload non-oggetto, duplicazione trasporto, campagne diverse, mutazioni dei listener ed eccezioni di consegna falliscono chiuso; ogni payload è clonato per destinatario. Nessun componente shipping installa ancora il trasporto, perciò questa fondazione non promuove `channelReady` e non inoltra alcun evento. Il prossimo sottoblocco deve legare il runtime ai peer server-verificati e alle policy GM/player già esistenti, non direttamente al signaling o al replicatore snapshot.

Binding GM verificato - 16 novembre 2026: `ArubaVerifiedGmCampaignChannelBinding` compone runtime, router GM autorevole, prove peer WSS e adapter DataChannel esistenti. Il runtime diventa pronto soltanto dopo prova server coincidente e canale aperto; outbound GM passa dalla policy di visibilità per singolo player, inbound passa dalla policy player e perde qualunque identità dichiarata sul wire. Revoca, chiusura o ultimo peer rimosso azzerano readiness; policy esplicite e proprietà runtime unica sono obbligatorie. Il binding non è ancora montato nello shipping: l'attuale sessione UI non espone ancora al chiamante i callback peer verificato/revocato e il DataChannel, quindi `channelReady` resta `false` nel prodotto.

Binding player verificato - 16 novembre 2026: `ArubaVerifiedPlayerCampaignChannelBinding` installa il runtime soltanto per utente player distinto dall'owner, campagna bootstrap valida e DataChannel già aperto. L'outbound è limitato alle richieste candidate player (chat/dadi/misurazione e subset azioni mappa), mentre eventi autorevoli GM come cambio scena sono negati; l'inbound accetta soltanto famiglie host allowlisted e non riflette richieste player. Frame malformati, sovradimensionati, eventi sconosciuti, owner impersonato e canali non aperti falliscono chiuso. Chiusura/error azzerano readiness. Anche questo binding resta non montato finché il client WSS shipping non sostituisce il trasporto sperimentale attuale.

Montaggio trasporto shipping verificato - 16 novembre 2026: `ArubaGmLiveScene` non usa più `createAuthorizedSceneSession`; dopo l'ingresso esplicito crea `createArubaWebRtcSignalingClient`, ottiene prima credenziali TURN cookie-only e collega `onVerifiedPeer`, `onPeerRevoked` e `onDataChannel` ai binding GM/player. Uscita, cambio campagna, unmount, errore TURN e revoca chiudono client e binding con invalidazione della generazione. Il GM inoltra per ora soltanto chat, dadi e misurazioni, che non dipendono da segreti della mappa; tutte le azioni e proiezioni mappa restano negate finché il vero `SessionWorkspace` non fornisce stato corrente, handler originali e proiezione player. Il runtime può quindi diventare pronto solo con un DataChannel verificato reale, ma questo montaggio da solo non certifica parità realtime o workspace player.

Bridge GM del workspace originale - 16 novembre 2026: il vero `SessionWorkspace` espone ora un boundary opzionale owner-only composto da getter live della scena autorevole e riferimenti ai tre handler originali token/POI/layer; non è stato aggiunto alcun reducer o stato mappa parallelo. `ArubaOriginalSessionWorkspace` registra il boundary per UUID campagna e lo revoca su cambio/unmount. Il trasporto verificato resta montato quando si passa dalla route Sessione alla route Mappa, pur nascondendo il pannello di stato fuori dalla Sessione. Ogni comando mappa player viene autorizzato contro peer ancora collegato, capitolo e stato GM correnti, normalizzato e poi consegnato al corrispondente handler originale; payload raw non autorizzati non vengono trasmessi al workspace. L'outbound mappa verso player resta negato: servono ancora snapshot/proiezione revisionata e workspace player read-only prima di certificare multiplayer mappa.

Workspace player originale read-only - 16 novembre 2026: la route Mappa del giocatore monta ora il vero `SessionWorkspace` con `isOwner=false` soltanto durante una sessione esplicitamente attiva e verificata. L'adapter `ArubaSessionActiveScene` distingue owner e player: solo l'owner legge/scrive il documento Aruba `active-scene`; il player non monta letture o scritture documentali owner e riceve lo stato esclusivamente dal runtime di campagna verificato. Ogni pubblicazione owner viene prima persistita, quindi inviata come `active_scene_change`; il binding GM la inoltra soltanto se campagna e cinque famiglie mappa coincidono esattamente con la proiezione ottenuta dagli helper originali (`publicMapTokens`, `publicMapDrawings`, `publicMapPois` e ordine filtrato). Un peer appena collegato riceve anche la pubblicazione corrente proiettata quando il workspace GM è disponibile. Il renderer, i controlli non-owner e la grafica restano quelli originali. Questo abilita il percorso funzionale read-only GM→player, ma non certifica ancora il protocollo revisionato/gap recovery né l'E2E simultaneo reale; tali gate restano falsi.

Revisioni shipping della mappa - 16 novembre 2026: il binding GM assegna ora `arubaMapRevision` monotona a ogni `active_scene_change` proiettato, inclusi gli snapshot completi inviati all'arrivo di un peer. Il binding player accetta una revisione iniziale arbitraria per ogni nuovo DataChannel verificato, ignora soltanto il duplicato identico e richiede poi esattamente `n+1`; revisione assente, regressione o gap chiudono il DataChannel, revocano readiness e impediscono l'applicazione dello stato successivo. Una nuova connessione riparte con un epoch fresco e snapshot completo. Il protocollo shipping usa snapshot completi revisionati, non i delta sperimentali separati, così il vero `SessionWorkspace` resta l'unico applicatore dello stato. Manca ancora una prova browser simultanea reale di disconnessione/rientro e reti diverse; i gate finali restano falsi.

E2E Chromium simultaneo controllato - 16 novembre 2026: `browser-shipping-campaign-channel.mjs` esegue i moduli shipping in due contesti Chromium distinti con cookie GM/player separati, gateway WSS TLS reale, identità server-verificata, ICE e RTCDataChannel reali. La prova verifica attachment unico, readiness player, snapshot revisioni 1 e 2, disconnessione player, nuovo signaling/DataChannel con epoch fresco e revisione 3, quindi revoca membership tramite heartbeat server e assenza assoluta di consegne successive. Il bundle browser è unico come Vite, così runtime e binding condividono la stessa istanza del registro. PASS sul loopback controllato Windows. Non equivale ad account staging reali, TURN pubblico, Android, Wi-Fi/5G o reti distinte: `networkGMPlayerVerified`, `allRolesVerified` e i gate finali restano `false`.

Gate UI Mappa live - 16 novembre 2026: CampaignHome espone `Apri mappa` soltanto dopo ingresso esplicito e lo abilita solo quando il DataChannel verificato ha installato il binding shipping. Arresto, errore globale, chiusura player, revoca e unmount azzerano il gate; lato GM la revoca di un peer ricalcola readiness da `attachedCount`, senza espellere dalla mappa una sessione che conserva altri player verificati. Il workspace player richiede lo stesso gate anche nel ramo di rendering e non può apparire vuoto durante il solo signaling. Restano da eseguire navigazione UI completa e screenshot multi-viewport su browser simultanei prima di promuovere `sessionNavigationParityVerified`.

E2E UI shipping Sessione→Mappa - 16 novembre 2026: `browser-shipping-session-map-ui.mjs` serve la build produzione su HTTPS e usa due contesti Chromium con cookie, bootstrap e membership distinti. Verifica ingresso esplicito GM/player, pulsante Mappa bloccato fino al DataChannel, apertura dei veri `SessionWorkspace` owner e player, assenza di richieste player verso documenti/endpoints owner, screenshot GM 1440×900 e player 390×844, revoca heartbeat e rimozione fail-closed del solo workspace player. La prova ha individuato e chiuso uno smontaggio del trasporto causato dal cambio `<main>`/`<div>` di AppShell: il pilot usa ora il nodo contenuto stabile opt-in, mantenendo un solo landmark e lasciando invariato il default originale. PASS controllato; il fixture soddisfa il contratto TURN ma forza candidate ICE locali per determinismo, quindi non prova TURN pubblico o reti separate. `sessionNavigationParityVerified` e i gate finali restano `false` fino a revisione screenshot/baseline e staging reale.

Revisione screenshot locale - 16 novembre 2026: la prima cattura ha rilevato asset statici bloccati dalla route fixture, overflow della CampaignHome a 390 px e titolo Mappa troncato. La fixture consente ora gli asset pubblici reali; le sole regole narrow-screen Aruba dispongono banner, filtri e griglia in colonna, preservano spazio per i controlli flottanti e rendono il placeholder mappa adattivo. L'E2E ricattura ora Sessione e Mappa per GM e player in tutti i sei viewport contrattuali (24 PNG) e fallisce su overflow orizzontale del documento. Le ricatture confermano logo/campaign fallback integri e titolo player leggibile. Questa è revisione tecnica locale, non confronto pixel approvato contro baseline originale: `visualBaselineApproved` e `layoutDiffReviewed` restano `false`.

Continuità shell Sessione/Mappa - 16 novembre 2026: `liveSessionShellActive` include ora la route Mappa durante una sessione autorizzata. Il passaggio al vero SessionWorkspace non rimonta più LeftSidebar/GmSectionSidebar: conserva la rail sessione role-scoped, QuickDice e i boundary Note/Schede sopra il workspace, senza smontare trasporto o DataChannel. Le 24 ricatture mostrano la stessa shell contestuale per GM e player e l'E2E di revoca resta PASS. La divergenza `dynamic-rail-visibility` è risolta localmente; `sessionNavigationParityVerified` resta `false` finché confronto originale formale, cross-panel completo e ambiente reale non sono approvati.

Routing incrociato rail - 16 novembre 2026: l'E2E shipping esercita ora Schede e Dadi sia in Sessione sia sopra Mappa per GM e player. Verifica apertura/chiusura dei pannelli role-scoped, workspace ancora montati e conteggio invariato degli eventi `close` del DataChannel; Note è verificata fail-closed quando la capability backend non è presente. `crossPanelRoutingVerified` è quindi `true` nel contratto capability-gated. Restano separatamente aperti il confronto originale formale, PostgreSQL/API combinati e i due gap applicativi `owner-only-campaign-list` e `contextual-character-open`.

Claim e dettaglio narrativo reali - 17 novembre 2026: `browser-character-claim-real-db.mjs` ha verificato in Chromium, contro HTTP e PostgreSQL uso-e-getta, claim GM/player, grouping, modifica, ritratto, asset, release, race con lock DB e revoca membership; `character-claim-contract.json` è `verified` su 9 boundary. `browser-narrative-notes-real-db.mjs` ha verificato media, Chapter, d20, tratti/azioni personalizzati e crop; `browser-scene-placement-real-db.mjs` ha verificato il placement Scene sulla superficie originale Capitoli/Scene, con reload PostgreSQL e ritorno al Capitolo. `narrative-entity-detail-contract.json` è `verified`; Environment, posizioni mappa e cartelle restano rifiutati dall'API/SQL e il selettore Luogo isolato è disabilitato. `owner-only-campaign-list` e `contextual-character-open` sono quindi risolti. Restano blocker di release `originalAndArubaVisualDiff` e `combinedBrowserRealDatabaseSession`.

## Decisione vincolante

Non distribuire il VTT definitivo, non dichiarare "100%" e non chiudere questa revisione prima che ogni schermata originale e ogni flusso operativo siano mappati, implementati e verificati *nel browser contro API e PostgreSQL effettivi*, con parità visiva approvata. Il nero/oro e le icone Phosphor Duotone sono variazioni **deliberate e approvate**; spostamenti dei comandi, schermate alternative, sezioni svuotate e modifiche a tipografia, layout o comportamento non lo sono. `main` e VPS non vengono cambiati da questo audit.

## Evidenze già controllate (non estrapolazioni)

- Originale: `src/app/App.tsx` importa `AppShell`, `TopBar`, `LeftSidebar`, `GmSectionSidebar`; la parte centrale contiene `CampaignHome` e i gestori originali, con la barra destra separata.
- Originale: `LeftSidebar.tsx` usa **100 px**, `GmSectionSidebar.tsx` **80 px**. `AppShell.tsx` rende la barra superiore nell'area destra della sidebar sinistra, *sopra* la colonna GM.
- Pilot: `apps/aruba-vtt-pilot/src/main.tsx` monta ora il vero `AppShell` originale con `TopBar`, `LeftSidebar` e rail GM negli slot previsti; le classi `workspace`, `primary-sidebar`, `topbar` e `gm-sidebar` sono passate alla shell, non ricostruite con un contenitore parallelo.
- Differenza di navigazione: `main.tsx` ha una voce autonoma **Note** nella barra destra; `GmSectionSidebar.tsx` originale non contiene tale voce. `SessionNotesPanel.tsx` fa parte del contesto di sessione. Questo va riconciliato, non consolidato come nuova UX senza approvazione.
- Il pilot non usa più segnaposto generici per Mappe, Capitoli/Scene, Preparazione, PNG, Mostri, Indizi, Eventi, Oggetti, Fasi, Combattimento e Asset Grafici: ogni route monta il componente originale o un adattatore Aruba collaudato. Restano parziali le funzioni senza percorso Aruba completo e certificato (UI inviti, avvio sessione originale, realtime mappa) e le sezioni non ancora certificate una per una.
- Il collaudo Chromium delle Note funziona con API simulate; un test separato usa API HTTP/PostgreSQL 17 reale e identità di sessione di prova. **Non** è ancora un unico test completo login + browser + API reale + database + multiplayer.
- `deploy/aruba/scripts/activate-vtt-campaigns.sh` applica nel database di prova le migrazioni **008–012**, non tutte le migrazioni 013–025 testate in CI. Lo script esistente non deve essere scambiato per un rilascio delle Note o del VTT completo.
- `deploy/aruba/VTT-DESIGN-CONTRACT.md` già tutela le barre e il flusso schede, ma contiene sezioni scritte durante fasi precedenti: confrontare sempre il codice effettivo del ramo, non assumere che un commento storico sia lo stato finale.
- La CI Aruba ha superato il collaudo Note con API/PostgreSQL effettivi; la CI generale ha un errore preesistente nel controllo skin Arcano. Nessuno dei due risultati dimostra la parità visiva globale.

## Inventario obbligatorio e priorità

L'inventario machine-readable è in `deploy/aruba/qa/full-parity-contract.json`. Le sezioni originali della navigazione (3 a sinistra, 12 a destra) devono corrispondere **esattamente** a quelle presenti nel codice originale, con un record esplicito per ciascuna. Ogni divergenza di nuova navigazione deve essere registrata e risolta; le aree obsolete devono avere una decisione di dismissione che dimostri dove è confluita ogni funzione.

| Priorità | Blocco | Esito iniziale | Condizione per chiudere |
|---|---|---|---|
| P0 | AppShell / TopBar / barre sinistra-destra | Divergente | Riutilizzo o resa geometricamente e funzionalmente equivalente, senza cambio layout |
| P0 | CampaignHome e sessione GM/giocatore | Da migrare | Navigazione, ruoli e stato effettivo testati |
| P0 | Mappe, scene e strumenti TopBar | Parziale | Workspace owner, persistenza `session-map-*`, toolbar e sei viewport verificati; realtime mappa, multiplayer e approvazione visuale ancora aperti |
| P0 | PG, PNG, Mostri / schede e Token Studio | Parziale | Apertura dalla card al dettaglio giusto, rail Scheda/Immagine/Token, edit e persist |
| P0 | Note GM/campagna e Note personaggio | Parziale | Editor, sottoschede, cartelle, cestino, visibilità e collaborazione nel loro contesto originale |
| P0 | Trasporto GM-hosted e sincronizzazione | Da migrare | Sessione reale desktop/Android, Wi-Fi e reti differenti, autorizzazione e riconnessione |
| P1 | Dadi 3D, skin, formule, chat e tiri segreti | Parziale | Identica interazione, rendering e risultati condivisi |
| P1 | Capitoli, Preparazione, indizi, oggetti, combattimento, fasi | Da migrare | Tutte le pagine e azioni, link e salvataggi verificati |
| P1 | Account e permessi | Bloccato | Identità reali recuperabili, ruoli e dati riconciliati senza perdita |
| P0 | Pixel/layout/accessibilità/responsività | Non verificato | Baseline originale approvata, test automatici e controllo umano per viewport |

## Revisione codice completa — procedura, non attestazione già eseguita

**1. Inventario sorgenti e dipendenze.** Censire tutte le route, i componenti, i provider React, i servizi, gli hook, il routing, i CSS, i dati e le dipendenze `supabase`, `vercel`, Storage, realtime, PeerJS/WebRTC, asset remoti. Per ogni simbolo: sorgente originale, adattatore Aruba, API/DB, test, permessi, livello di integrazione. Cercare percorsi secondari e pannelli legacy (per esempio Asset Grafici) *senza rimuoverli fino a verifica della sostituzione*.

**2. Revisione integrata.** Verificare dati e ruoli GM/giocatore, salvataggi e conflitti, robustezza a refresh/offline, rollback, race condition, rendering, performance, sicurezza (cookie/CSRF, controllo ruoli su DB, file upload, visibilità di Note private), errori e accessibilità. Un test isolato non certifica interazioni fra aree.

**3. Parità visiva.** Preparare screenshot *dell'originale eseguito localmente dal vero `main`* con dati controllati, e screenshot Aruba agli stessi breakpoint, stato, tema e dati. Confrontare header, griglie, spaziature, font, larghezze, overflow orizzontale e verticale, tronca-testo, min-width, scrollbar, z-index, overlay, tooltip, menu, modali, rail, bottoni e icone. Non usare screenshot generati a mano né la nuova UI come baseline di sé stessa. Le differenze approvate (nero/oro, Phosphor Duotone navigazione) vanno annotate. Se un'area dipende da vecchi servizi indisponibili, preparare fixture locale **solo per la baseline originale**, non sostituirla con una schermata diversa.

**4. Matrice viewport.** 360×800, 390×844, 768×1024, 1280×720, 1440×900 e 1920×1080; prevedere anche zoom browser 125/150%, testi lunghi, liste vuote, molte righe e modali multiple. Verificare `scrollWidth <= clientWidth` dove il contenuto non prevede scroll, bounding box dentro viewport, sovrapposizioni, tagli e focus. Screenshot diff da revisionare manualmente, non solo soglie automatiche.

**5. Collaudi end-to-end.** Browser Chrome/Edge Windows e Android, GM + giocatori in campagne diverse, lettura/scrittura autorizzate, salvataggi fra refresh, clic card→scheda corretta, connessione locale/5G, realtime e reconnessione, carichi dati grandi e asset originali.

**6. Gate di pubblicazione.** Tutte le voci del JSON devono essere marcate `verificato` con evidenza reale e l'oggetto `acceptance` completamente `true`; `node deploy/aruba/qa/verify-full-parity-audit.mjs --release` deve terminare con codice 0; CI generale e Aruba verdi, screenshot approvati, backup/restore e piano rollback provati. Solo allora prendere in considerazione promozione su `main` e cutover.


## Approfondimento 02 — Routing e due barre destre: divergente (verifica sorgenti)

**Riferimenti:** `App.tsx` (gestione delle tre viste e passaggi di contesto);
`GmSectionSidebar.tsx` (barra GM nella dashboard);
`CampaignHome.tsx` (campagna, stato sessione, giocatori);
`SessionRightSidebar.tsx` (barra sessione + pannello `SlideOverPanel`).
Contratto machine-readable: `deploy/aruba/qa/session-navigation-contract.json`;
validatore: `deploy/aruba/qa/verify-session-navigation-contract.mjs`.

La **barra destra della dashboard** e la **barra destra della sessione**
non sono intercambiabili. La prima mostra i 12 strumenti di gestione GM;
non è presente nella dashboard quando il tab attivo è Personaggi o Campagne.
La seconda mostra **Chat, Schede, Note, Dadi**, e soltanto al GM
**Incontri, Combatti**. Il click sull'icona sessione apre il rispettivo
`SlideOverPanel` sopra la vista campagna, invece di navigare alla
pagina centrale. Il pannello Schede riceve `initialSelection` dalla
card nella campagna, attraverso `App.openSessionEntity`. I collegamenti
tra Note usano gli eventi originali `SESSION_NOTE_OPEN_EVENT` e
`SESSION_NOTE_PICK_EVENT`. I pannelli di Chat, Schede, Note e Dadi
hanno larghezze e resize specifici. La sessione attiva monta
`SessionWorkspace` e può nascondere la barra sinistra.

**Scostamenti Aruba confermati dal codice:** il pilot usa una barra destra
GM unica, include una voce Note che apre una pagina centrale, limita
`activeCampaign` alle sole campagne possedute dall'utente, non monta
`CampaignHome`, `SessionWorkspace`, `SessionRightSidebar` e non
usa la `TopBar` originale. Anche il collegamento card della campagna →
Schede sessione non è riprodotto da un normale pannello di dettaglio
dell'archivio Personaggi.

**Conseguenza:** non spostare la barra delle Note dal pilot alla
produzione mantenendo questo comportamento. La destinazione finale deve
adattare la vera `SessionRightSidebar` o raggiungere l'identico
comportamento e geometria sotto test; vietato sostituire il sistema
con una pagina o una barra alternativa. Il layout originale è la base
di screenshot, con i soli aggiornamenti nero/oro e icone concordati.

Questa verifica è **strutturale** e non sostituisce test reali di
realtime, giocatori e layout responsive. I sette scostamenti restano
`open` fino a evidenze verificabili. Non toccare lo staging con
questo audit.

## Integrazione 03 — SlideOverPanel originale per Note (test browser)

La build di prova usa ora direttamente `src/app/components/session/SlideOverPanel.tsx`
per il pannello Note. Chromium verifica che il contenitore laterale originale
esista, rimanga entro il viewport e risponda a Escape e al riclick.
Il contenuto `SessionNotesPanel` e i relativi adapter TipTap/Aruba
restano invariati. Il layout nero/oro eredita le variabili del pilot.

**Parità ancora aperta:** la barra destra di sessione `SessionRightSidebar`
completa non è ancora montata; il trigger Note si trova nel rail GM del
pilot e il contesto centrale non è ancora `CampaignHome` /
`SessionWorkspace`. Questo step elimina la sostituzione del
contenitore laterale con una pagina Note centrale, **non** certifica
la navigazione originale al 100%.

## Limiti e prossimo lavoro

Questa è la **prima ricognizione strutturale del codice**, non un'analisi conclusa file-per-file né una certificazione grafica. La mappatura del routing e dei contesti di sessione è stata aggiunta come secondo approfondimento. Restano da analizzare le dipendenze interne di `TopBar`, `CampaignHome` e `SessionWorkspace`, da riutilizzare con gli adattatori Aruba, quindi produrre screenshot baseline reali. Non dichiarare percentuali inventate né promettere il 100% prima della verifica sistematica.

## Integrazione 04 — Barra di sessione distinta (pilot, non finale)

Una vista campagna esplicita è ora raggiungibile da «Entra nella campagna».
Mostra una barra **sessione** distinta dagli strumenti di gestione GM.
L'ordine dei sei comandi corrisponde al codice originale:
Chat, Schede, Note, Dadi, Incontri, Combatti. Solo Note è collegato
al vero `SlideOverPanel` e ai servizi già testati; tutte le altre
azioni sono realmente disabilitate. La vista non pretende di essere
`CampaignHome`, né di simulare lo stato live/giocatori.

Il prossimo lavoro è reinserire i componenti originali e il relativo
contesto `SessionRightSidebar`/schede/dadi/chat, senza conservare
questa vista temporanea nel rilascio definitivo.

## Integrazione 05 — Schede contestuali (pilot, non certificazione finale)

Il pulsante Schede della barra sessione ora apre un elenco di
personaggi attivi della campagna ottenuto dalle vere API Aruba.
Selezionarne uno apre l'adattatore già esistente
`ArubaCharacterDetailPanel` con il vero `EntityDetailView`,
`EntityDetailRail` e `SlideOverPanel` originali; non apre le
obsolete schermate riassuntive. Il controllo verifica campagna e
proprietario prima di presentare le righe. Non ci sono dati inventati.
Le sezioni PNG/Mostri, il percorso card da `CampaignHome` e la
`SessionCharactersPanel` completa restano da migrare, così come
la partecipazione dei giocatori. Nessun deploy sul VPS.

## Integrazione 06 — Card originali e richiesta Schede con requestId

Le card PG attive, ottenute dall'API Aruba autenticata, riutilizzano
`EntityCard` originale e griglia a due colonne con larghezza protetta.
Ogni click invia alla sessione l'UUID e un `requestId` crescente
con `kind:'pg'`, come `App.openSessionEntity`.
Questo permette di aprire, chiudere e riaprire lo stesso personaggio,
anche usando la tastiera, senza mostrare la schermata riassuntiva legacy.
La lista sessione preserva la selezione. Il pannello dettaglio mantiene
`EntityDetailView` e `EntityDetailRail` originali.

Sono ancora assenti il `CampaignHome` definitivo, partecipanti
giocatori, PNG/Mostri, realtime e le altre card e viste storiche.
Questo step non costituisce certificazione 100%.

## Integrazione 07 — Elenco partecipanti verificato dal database (sola lettura)

Migrazione `026_vtt_campaign_roster.sql` aggiunge una funzione
`SECURITY DEFINER` di **sola lettura** per il GM proprietario
della campagna; nega ogni visibilità agli utenti estranei e ai giocatori,
non include email e filtra gli account disabilitati e i membri revocati.
`/vtt/campaigns/:id/roster` prende l'identità esclusivamente
dalla sessione autenticata. L'attivazione richiede
`AUTH_VTT_CAMPAIGN_ROSTER_ENABLED=true`, disattivo per impostazione
predefinita e vietato fuori dal database staging di autenticazione.
La build Aruba mostra i partecipanti soltanto quando la capability
autorizzata è presente; i ruoli non sono modificabili.

Test reale PostgreSQL/HTTP: proprietario, giocatore, utente estraneo,
visibilità email, revoca membro, campagna vuota, ID malformato e cookie
assente. **Non abilita** inviti, assegnazioni personaggi o presenza online.
PNG e Mostri restano non migrati e non sono rappresentati con dati
inventati. Questo è un incremento dell'API, non la conversione di
`CampaignHome` né una certificazione grafica.

## Integrazione 08 — Players raggruppati per proprietario reale (staging)

L'elenco partecipanti e i PG attivi del GM sono ora combinati in
righe simili alla sezione Players del `CampaignHome` originale.
Il dato proviene esclusivamente dalle API cookie+SQL già verificate,
senza introdurre proprietari artificiosi. I PG del GM compaiono sotto
il GM, i membri giocatori senza schede restano visibili con un messaggio
esplicito; non viene interpretata l'appartenenza alla campagna
come assegnazione di un personaggio. Le card riutilizzano il vero
`EntityCard`, con apertura del dettaglio contestuale e da tastiera.
Quando il roster non è abilitato, rimane il comportamento PG precedente.

**Attenzione:** manca ancora la migrazione di proprietà e assegnazioni
PG dei giocatori, inclusa la distinzione fra precompilati disponibili,
PG rivendicati, personaggi orfani e l'accesso delle campagne joined.
Questo adattatore è un sottoinsieme corretto, non la
`CampaignHome` completa. PNG, Mostri e realtime restano da migrare.

## Integrazione 09 — Precompilati GM disponibili, senza trasferimento proprietà

La migrazione 027 introduce `available_for_players` (false per default)
nei PG del GM; funzioni SQL `SECURITY DEFINER` e servizi HTTP del GM
consentono lettura/modifica esclusivamente per PG attivi della sua
campagna. L'endpoint e la nuova UI sono disattivati di default e
richiedono `AUTH_VTT_CHARACTER_AVAILABILITY_ENABLED=true` nello
staging con migrazione applicata. Il GM può rendere disponibile il
PG e revocare la disponibilità senza perdere la proprietà.
Questa operazione **non** assegna, rivendica o copia personaggi.
Nessuna autorizzazione di modifica dei personaggi viene concessa ai
giocatori. Per assegnare PG serve ancora un flusso di claim atomico,
con revoche e titolarità per ruolo.
