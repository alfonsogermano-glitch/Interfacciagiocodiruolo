# Integrazione Aruba del VTT originale — fase campagne

Decisione progetto: Aruba è la destinazione principale. Non è richiesto mantenere Vercel/Supabase disponibili durante la migrazione; non eliminare però repository e dati degli account reali prima di poterli esportare.

Ricognizione: il VTT React esistente in `src/app/App.tsx` utilizza `AuthContext` Supabase e `CampaignContext` che chiama Supabase Edge Functions. La dashboard originale comprende `AppShell`, barra superiore, sidebar, creazione campagne/personaggi, mappe, note, sessioni e dadi. Non è sicuro passarle una sessione Aruba fingendo un JWT Supabase.

Questa fase implementa un database campagne nativo Aruba e riprende la disposizione dashboard originale (sidebar, barra superiore, azioni rapide, schede campagne) nella build isolata, senza importare i servizi Supabase. Ancora da trasferire: UI originale completa, strumenti personaggio, note, dadi 3D, game session, inviti, ruoli GM/giocatore per campagna, sincronizzazione GM-hosted. Non presentare le nuove schede come il VTT completo.

Database: `deploy/aruba/sql/008_vtt_campaigns.sql` crea `hollowgate_vtt.campaigns`, limitata per owner, e due routine SECURITY DEFINER. Il runtime non ha accesso SQL diretto alle tabelle. Il backend espone `GET/POST /vtt/campaigns` SOLO se `AUTH_STAGING_ENABLED=true`, database `hollowgate_auth_test`, ruolo `hollowgate_auth_app`, e `AUTH_VTT_CAMPAIGNS_ENABLED=true`; l'owner è derivato dalla sessione HTTP e mai dal payload.

Le vecchie campagne Supabase non vengono importate e non vengono cancellate. Per ora un nuovo account Aruba può creare e rileggere campagne di prova.

Per attivare: da SSH sul VPS, dopo `git pull --ff-only origin feature/aruba-api-foundation`, eseguire `bash deploy/aruba/scripts/activate-vtt-campaigns.sh`. Lo script convalida i prerequisiti, costruisce la UI dedicata, applica 008 esclusivamente al DB test, abilita la feature privata, verifica 401 senza password e /health 200. In caso di errore tenta di ripristinare il precedente assetto privato. Non cambia `main`, DNS o il sito Vercel.

**Non usare dati reali** nella prima campagna. Per tornare alla modalità precedente: `sudo docker compose -p hollowgate-auth-staging -f deploy/aruba/compose.auth-staging.yaml -f deploy/aruba/compose.auth-trial.yaml up -d --no-deps --force-recreate aruba-auth-staging`. I dati di prova restano nel database.

## Campagne Aruba — modifica dei metadati (009)

Aggiunto `PATCH /vtt/campaigns/:id`, per cambiare soltanto **nome** e **descrizione** della campagna selezionata. Richiede cookie di sessione Aruba valido, verifica Origin sul server e autorizza l'update con la proprietà `owner_id` su PostgreSQL. Il regolamento resta intatto e non esiste update diretto delle tabelle per il ruolo runtime.

Lo script di attivazione applica ora 008 e **009**, in ordine, esclusivamente al database `hollowgate_auth_test`, prima di avviare l'API aggiornata. Questo modifica lo staging test: eseguire solo dopo CI positiva e controllo del server. La produzione e gli account reali non vengono toccati.

La dashboard Aruba mantiene 100 px a sinistra, 80 px a destra. Permette la selezione e la modifica dei metadati delle campagne effettivamente restituite dall'API; i componenti PG/PNG, note e sessioni originali devono ancora essere portati.

## Recupero autentico del motore dadi

Il portale Aruba riutilizza il **motore di calcolo originale** `diceEngine.ts` e `diceQuickRollState.ts` senza copiare o modificare gli algoritmi. La selezione standard d4/d6/d8/d10/d12/d20/d100, accumulo, rimozione, lancio e visualizzazione risultati sono ora collegati a una campagna Aruba selezionata. Il generatore usa `crypto.getRandomValues` originale anziché `Math.random`. L'interfaccia di tiro rapido è ancorata alla parte bassa sinistra dell'area di gioco, come nella disposizione precedente.

**Limite esplicito:** solo cronologia di sessione locale in memoria, non viene salvata e non viene trasmessa ai giocatori. Il vecchio overlay 3D, le formule, i dadi personalizzati, la chat tiri condivisa e le skin non sono ancora collegati. Non presentare questo recupero come multiplayer pronto; in particolare i tiri segreti richiedono il trasporto e i ruoli di campagna.

## Ordine di uscita da Supabase e Vercel (nessuna dismissione anticipata)

1. **Identità:** inventario verificato degli utenti reali Supabase (senza copiare segreti o password), criterio di riconciliazione via email verificata, flusso di recupero accesso Aruba; non cancellare utenti o account prima della verifica individuale.
2. **Interfaccia e dati:** importare i veri componenti originali con adapter Aruba anziché replicare pannelli incompleti; prima schede PG/PNG e archivio campagne, poi note, mappe, asset, dadi 3D.
3. **Sessioni:** autorizzazioni GM/giocatore per singola campagna, scambio dati GM-hosted, signaling/TURN e collaudo LAN/Wi-Fi/5G, con particolare attenzione ad Android.
4. **Pubblicazione:** backup e restore su VPS, test end-to-end con account e campagne di prova, configurazione dominio definitivo verso Aruba e HTTPS, monitoraggio; disattivare Vercel soltanto dopo il cutover verificato.
5. **Dismissione Supabase:** esportare e verificare identità/dati degli account reali, confermare recupero per gli utenti, poi rimuovere dipendenze e progetto quando non esistono più blocchi di migrazione. Non provare a tenere accesi due siti in parallelo se non necessario al recupero utenti.

**Stato attuale:** non esiste ancora una via verificata per trasferire gli account Supabase; il sito Aruba resta uno staging privato e non sostituisce il gioco online completo.

## PG — Fondazione Aruba 010

La migrazione 010 crea `hollowgate_vtt.character_drafts`, con `sheet_data jsonb` compatibile con i dati del tipo `CharacterSheetData` originale, più owner, campagna e stato `draft`. Non è una scheda completa: i campi di stile, viaggio e abilità attendono il recupero del `CharacterCreationWizard` originale. L'API autenticata `GET /vtt/characters?campaignId=...` e `POST /vtt/characters` usa il proprietario della sessione, mai un owner inviato dal browser, e funzioni SQL SECURE DEFINER. Il runtime non ha permessi diretti sulla tabella. Lo schema viene applicato solo in `hollowgate_auth_test`; feature `AUTH_VTT_CHARACTERS_ENABLED` accesa esclusivamente dall'overlay `compose.character-trial.yaml`. Sono bozze di prova: non importare personaggi reali finché non esiste una migrazione verificata.

## Originale wizard personaggi HSC (011)

Il portale Aruba importa direttamente `src/app/components/gm/CharacterCreationWizard.tsx` **senza riscriverlo**, con logica originale per Stile, Viaggio, Ambiti, Abilità, Legami, Storia, Equipaggiamento e Tratti. La migrazione PostgreSQL `011_vtt_character_sheets.sql` abilita il salvataggio di `sheet_data jsonb` in una riga bozza appartenente alla sessione autenticata, verificando il proprietario e la campagna con funzione SECURITY DEFINER. Il client scarta l'ID suggerito dal wizard, non accetta riferimenti a immagini Supabase e preserva il vero ID Aruba.

La sola dipendenza del wizard da Supabase Storage era `ImageCropUploadModal`: il bundle Aruba la intercetta in compilazione con un dialogo esplicitamente non operativo, senza importare `ImageCropCore` o credenziali Supabase. Il caricamento immagini resta in sospeso fino allo storage Aruba. L'editor completo è abilitato solo per il regolamento `hsc`; le altre campagne conservano bozze. Non è ancora un flusso di partecipazione GM/giocatore e non offre salvataggi automatici.

## Scheda HSC originale, stato persistito e archivio (012)
Il portale Aruba riutilizza direttamente `src/app/components/CompleteCharacterSheet.tsx` e i tracker originali Freschezza, Follia, Condizioni, Turbe ed Equipaggiamento; il template è presentato nella palette nero/oro. Gli aggiornamenti dei tracker chiamano il servizio Aruba con una coda seriale, espongono l'errore se il salvataggio fallisce e non simulano cronologia condivisa. Il pulsante Elimina originale richiede conferma e usa `DELETE /vtt/characters/:id`: la funzione PostgreSQL owner-scoped introdotta nella migrazione 012 **archivia senza cancellare** le schede. Non esiste ancora interfaccia per ripristinare un archivio. Lo staging privato è il solo target supportato.

## Ripristino della vista Personaggi originale — fase intermedia

Il vecchio `MyCharactersPage.tsx` comprende un archivio globale con Personaggi/PNG/Mostri, `EntityCard`, `EntityFilterToolbar`, `EntityPagination`, filtri e pannelli di dettaglio, collegati a una complessa architettura Supabase, campagna, identità e realtime. **Non può essere importato integralmente senza le relative API Aruba**: la migrazione adatta inizialmente i componenti di presentazione originali (card, toolbar, paginazione, wizard) alle liste provenienti da tutti gli endpoint Aruba delle campagne di proprietà; mostra le tre schede originali senza inventare PNG/Mostri non ancora migrati. Le schede HSC già create, e le loro modifiche, restano nel database. Il pulsante `Nuovo personaggio` ora apre direttamente il wizard senza chiedere il nome fuori dal wizard; finché lo schema Aruba non supporta personaggi senza campagna, è necessario selezionare una campagna HSC dalla navigazione sinistra per creare un nuovo PG. In questo step il rail GM è nascosto nella vista globale Personaggi per mantenere lo scroll al bordo destro dello schermo, e la topbar resta estesa al 100% dell'area principale.

Le variabili Noir nero/oro sono centralizzate nella workspace Aruba, i componenti originali ricevono il tema Tailwind e il Preflight per evitare pulsanti e select nativi di Windows. Sono richieste **prove visive nel browser** prima di considerare la resa identica all'originale. La funzionalità di invito e gli archivi PNG/Mostri rimangono disabilitati e segnalati. Non confondere questo passaggio con la parità funzionale completa.

## Dettaglio originale EntityDetailView
La migrazione importa direttamente EntityDetailView.tsx e le tab originali Riepilogo, Condizioni e Follia, Equipaggiamento, Origini e Storia. Il Token Studio originale è all'interno dello stesso componente. Servizi Supabase, custom tab, immagini, PNG e realtime sono intercettati e disabilitati dove mancano le API Aruba; NON sono funzionalità dichiarate recuperate. Il salvataggio della scheda HSC usa ancora l'API Aruba esistente. Non aggiornare produzione prima dei test nel browser e del recupero integrale delle dipendenze.

## Original TipTap e sottoschede Aruba — integrazione in attesa di collaudo

La PR ora include il vero `RichTextEditor.tsx` originale con le sue estensioni TipTap, le tab originali di `EntityDetailView` e `EntityTabBar`, i servizi PostgreSQL di note `013_vtt_entity_notes.sql`, un client dedicato `entity-notes-client.mjs` e `ArubaBaseEntityTabs.ts` che connette creazione, modifica, duplicazione, rinomina, visibilità, archiviazione e salvataggio JSON al backend Aruba. Il dettaglio dei personaggi e le note condividono lo stesso pannello, non esistono nuove finestre sostitutive.

**Il servizio non è stato ancora attivato sul VPS.** `AUTH_VTT_ENTITY_NOTES_ENABLED` è opt-in ed è intenzionalmente assente dal compose staging. La sessione `/vtt/bootstrap` dichiara la capability `entityNotes`; `ArubaNotesProvider` e il wrapper dell'originale EntityTabBar consentono i controlli note solo se l'API li conferma. In caso contrario nessun endpoint note viene interrogato. Il nuovo SQL 013 viene collaudato **solo nel database effimero della CI**, non è incluso nello script `activate-vtt-campaigns.sh`.

I servizi legacy di auth/realtime/dadi custom/Supabase Storage vengono isolati **soltanto** per il bundle Aruba. L'editor originale mantiene i controlli locali TipTap e gli elementi inline, ma gli effetti lato sessione, dadi condivisi, immagini caricate, cartelle note e sotto-tab NON sono ancora supportati su Aruba. I loro controlli non devono essere presentati come funzionalità completamente operative.

`ArubaNotesWriteRegistry.mjs` collega le promesse di salvataggio note al sistema di chiusura dello slide-over: il pannello non deve chiudersi su errore di rete o su contenuto ancora pendente. Le note restano in una tabella propria, mai nel JSON della scheda. Permessi GM/giocatore, realtime, accessi per campagna non proprietaria, ordinamento drag & drop, cartelle, sotto-tab e tool dei dadi devono essere migrati e verificati con test browser prima del cutover.

Stato dei test: la pipeline Aruba API staging verifica struttura SQL, sicurezza API/HTTP, client note, compilazione React originale, e test della coda salvataggi. **Non è un collaudo end-to-end del browser.** Non aggiornare ancora il VPS Aruba con questi cambiamenti incompleti.

## Schema 014 — due livelli Note (in lavorazione, NON ancora da distribuire)

La CI migra e verifica in PostgreSQL effimero l'estensione additiva
`014_vtt_note_subtabs.sql`, con `parent_note_id` e `tab_order`.
Le funzioni proprietario/campagna/PG impediscono di creare una terza
profondità, di leggere il padre altrui, di salvare ordini contenenti ID
estranei o duplicati, e archiviano le sotto-note senza cancellarne il
contenuto. Gli endpoint HTTP e il client browser vengono testati con
`parentId` esplicito; niente ownerId preso dal browser.

Il sottosistema originale Note di campagna non è ancora stato montato,
poiché richiede l'autorizzazione GM/membro e le cartelle. Questo schema
014 riguarda la preparazione sicura dei dati, non una conferma di parità
delle Note di campagna. Lo strato Presentazione Personaggi continua a usare
il `RichTextEditor` originale direttamente nelle sue tab, senza essere
sostituito da `NoteSubTabs`. La pipeline di staging usa solo database
usa-e-getta; `activate-vtt-campaigns.sh` non applica 013 o 014 al VPS.
Mantieni la feature disabilitata su Aruba finché mancano le API di campagna
e il test visuale/end-to-end.

## Schema 015 — Note di campagna distinte dalle tab dei personaggi

Nuova tabella `hollowgate_vtt.campaign_notes`, **indipendente da character_id**
e dall'archivio `entity_notes`. La base dati mantiene contenuto TipTap JSON,
parent/child fino a due livelli, ordine iniziale, visibilità registrata e
archiviazione non distruttiva. Le routine SQL sono limitate al proprietario
attivo e verificato della campagna; il runtime non ha privilegi sulle tabelle.

**Non è ancora il sistema originale di Note di campagna completo**: nessun
servizio HTTP, nessun flag attivo, nessuna vista Note montata, nessuna autorizzazione
dei membri o dei ruoli GM/giocatore e nessuna gestione cartelle. Il campo
`visibility` è registrato ma non conferisce accesso ai giocatori. Migrazione
eseguita esclusivamente nel PostgreSQL effimero della CI; script VPS e DNS invariati.

## API Note di campagna: servizio isolato (non distribuito)

Lo schema 015 ha ora un servizio Node.js dedicato, distinto dalle custom tab dei PG:
`GET/POST /vtt/campaign-notes` e `PATCH/DELETE /vtt/campaign-notes/:id`.
Tutte le operazioni ricavano il proprietario dalla sessione cookie Aruba;
le modifiche richiedono Origin HTTPS esatto, payload whitelisted e le routine
PostgreSQL SECURITY DEFINER owner-only. Le Note possono avere un padre fino a
due livelli; nessuna identità GM/giocatore è accettata dal browser.

**Feature rigorosamente spenta per default**: richiede
`AUTH_VTT_CAMPAIGN_NOTES_ENABLED=true`, l'abilitazione delle campagne e lo
schema 015 installato manualmente nel solo database test. Non aggiungere tale flag
al compose VPS, non distribuire SQL 015 né mostrare pulsanti nell'interfaccia
finché autorizzazioni membri, cartelle, NoteSubTabs originale e collaudo E2E
non saranno disponibili. Il campo `visibility=all` è dato memorizzato, non
concessione di accesso ai giocatori in questa fase.

## Schema 016 — membership e privacy Note (CI soltanto)

Tabella `campaign_members` con ruoli **per campagna** `gm` e `player`,
assegnati e revocati solo dal proprietario verificato; il proprietario
è implicitamente GM nella propria campagna e può essere un giocatore altrove.
La funzione di lettura `list_member_campaign_notes` applica nel database
l'accesso `visibility='all'`, la proprietà della nota e l'eredità della
visibilità del padre, senza fidarsi dei ruoli dichiarati dal client.
Le Note private altrui non diventano visibili ai GM ospiti. Revoca e utente
non verificato negano immediatamente la lettura; nessun privilegio diretto
sulla tabella membership al runtime.

**Questo è solo il livello di autorizzazione testato su PostgreSQL usa-e-getta**.
Nessun invito, servizio HTTP per membri, scrittura GM, aggiornamento VPS,
montaggio della UI Note o deploy della migrazione 016. Le API di Note 015
rimangono owner-only e spente: non sostituirne i controlli con permessi frontend.

## Lettura API per membri della campagna (integrazione 016)

La rotta GET di `/vtt/campaign-notes` usa ora esclusivamente
`list_member_campaign_notes`, non più `list_owned_campaign_notes`.
La funzione SQL risolve GM/giocatore in ciascuna campagna, applica la revoca
e filtra documenti privati e figli di note private prima della risposta.
Il servizio riceve l'ID dell'utente dalla sessione Aruba autenticata; le query
HTTP non accettano `role`, `ownerId` o altri campi non previsti.
POST/PATCH/DELETE rimangono **solo proprietario** tramite le routine 015,
senza dare automaticamente accesso di modifica ai GM ospiti.

Lo staging rimane disabilitato per default con
`AUTH_VTT_CAMPAIGN_NOTES_ENABLED` assente. L'attivazione futura richiede
**sia schema 015 sia schema 016** nel database test e collaudo E2E,
oltre alla UI originale Note; non distribuire ancora sul VPS.

## Trasporto client Note di campagna — base isolata

Il browser ha ora un client `campaign-notes-client.mjs` separato da
`entity-notes-client.mjs`. Il primo usa sessione cookie e rotte
`/vtt/campaign-notes`, valida UUID, padre, TipTap, visibilità e conferma
delle mutazioni, senza inviare ownerId, role o JWT Supabase.
`validateBootstrap` include la capability `campaignNotesEnabled` con
controlli sulle dipendenze da `campaigns`.

La UI originale `useCampaignNotesSection` usa cartelle, le sezioni GM/shared,
`NoteListRow` e `NoteSubTabs`. **Non è stata ancora montata**: occorre
prima supportare sul backend cartelle e permessi di scrittura per nota,
senza costruire una lista semplificata sostitutiva. Nessun deploy sul VPS.

## Schema 017 — Cartelle originali Note (ancora solo CI)

La nuova tabella `campaign_note_folders` supporta scope indipendenti
`gm` e `shared`, annidamento fino a cinque livelli, nome, icona, posizione,
e autorizzazione basata sul ruolo verificato nella campagna.
Le routine SQL sono `list_member_note_folders`,
`create_owned_note_folder` e `update_owned_note_folder`.
L'aggiornamento impedisce cicli, sforamento del limite a 5 livelli,
spostamenti fra scope e campagne e modifiche da parte di non proprietari.
I membri revocati e i giocatori non leggono le cartelle GM.

**Non ancora operativa in UI**: prima del montaggio dell'originale
`useFolderSection` servono assegnazione effettiva delle Note alle cartelle,
gestione archivio/cascade, riordino/icon picker e endpoint HTTP. Nessun
servizio Supabase originale viene importato nel bundle Aruba, nessun SQL
017 sul VPS e nessuna attivazione nel bootstrap.

## HTTP cartelle delle Note — step isolato

Il servizio `campaign-folders-service.mjs` usa esclusivamente le funzioni
SECURITY DEFINER 017 per elenco, creazione e modifica nome/genitore.
La route `GET/POST /vtt/campaign-note-folders` e
`PATCH /vtt/campaign-note-folders/:id` autentica il cookie Aruba,
verifica Origin sulle scritture e rifiuta owner/role nel payload.
Il GET restituisce solo le cartelle GM/shared consentite dal database.
Creazione e spostamento sono consentiti soltanto al proprietario
attivo della campagna. Non comprende ancora cestino, icon picker,
riordino e assegnazione delle Note: non collegare `useFolderSection`
prima che il suo contratto sia soddisfatto.

Flag `AUTH_VTT_CAMPAIGN_NOTE_FOLDERS_ENABLED` assente di default,
dipendente da `AUTH_VTT_CAMPAIGN_NOTES_ENABLED` e dallo schema 017.
Nessuna modifica alla configurazione del VPS o alla UI esistente.

## Schema 018 — collegamento Note/cartelle e separazione GM

La tabella Note guadagna `scope = shared|gm` e `folder_id` opzionale
(solo sulle note contenitore, non sulle sotto-tab). Le sotto-tab
ereditano lo scope alla creazione. `create_owned_campaign_note_scoped`
crea il contenitore nel relativo scope e
`assign_owned_campaign_note_folder` assegna o rimuove la cartella
con controllo della stessa campagna e sezione, senza concedere
modifiche ai giocatori.

La funzione di lettura membro di 016 viene ristretta anche per scope:
i giocatori non leggono note GM nemmeno se pubblicate con
`visibility=all`; una sottoscheda GM non si può enumerare tramite ID.
Il lettore `list_member_campaign_notes_with_folders` restituisce
folder_id e scope soltanto per documenti già autorizzati.
Nessuna modifica distruttiva ai documenti TipTap esistenti.

**CI isolata soltanto**: API HTTP per spostamento, archiviazione delle
cartelle, riordino/icona e montaggio della UI originale ancora da completare.
Non installare lo schema 018 sul VPS finché l'intero percorso non è collaudato.

## API e client per spostamenti Note/cartelle — integrazione 018

`GET /vtt/campaign-notes` usa `list_member_campaign_notes_with_folders`,
che espone sezione e cartella soltanto dopo la verifica nel database.
`POST /vtt/campaign-notes` accetta scope `gm|shared` opzionale SOLO per
note principali; le sotto-tab ereditano la sezione del padre.
`PATCH /vtt/campaign-notes/folder/:id` assegna o rimuove la cartella
(`folderId=null`) tramite `assign_owned_campaign_note_folder`,
verificando campagna, sezione e proprietà server-side.
Il client Aruba mantiene cookie same-origin, conferma delle scritture
e controlli incrociati su identificativi di nota e cartella.

Nessuna di queste rotte è disponibile senza
`AUTH_VTT_CAMPAIGN_NOTES_ENABLED=true`; schema 018 NON viene installato
sul VPS, e il VTT originale non è ancora montato. Manca tuttora la
gestione completa cartelle (archivio/cascade, drag, riordino e icone)
e il modello di scrittura per-GM/per-creatore oltre all'owner.

## Schema 019 — icone, posizione e cestino cartelle (solo CI)

Le routine `set_owned_note_folder_presentation` e
`archive_owned_note_folder` sono limitate al proprietario della campagna.
La prima modifica icona e posizione. La seconda supporta due modalità
non distruttive: archivia solo la cartella (le note diventano senza cartella,
le sottocartelle salgono di un livello) oppure archivia l'intero sottoalbero
con le sue Note e sotto-tab, preservando tutti i documenti TipTap.
L'interfaccia originale non viene ancora montata: mancano gli endpoint
e i controlli UI con conferma utente. Lo schema 019 non è sul VPS.

## API icone/ordine e archiviazione cartelle — schema 019

Le nuove rotte protette `PATCH /vtt/campaign-note-folders/presentation/:id`
(`campaignId, icon, position`) e `DELETE /vtt/campaign-note-folders/:id`
(`campaignId, cascade` booleano obbligatorio) usano esclusivamente le
routine owner-only PostgreSQL 019. L'archiviazione è logica e non
cancella i JSON TipTap. Le mutazioni richiedono cookie autenticato,
Origin HTTPS esatto e payload whitelisted, senza `ownerId` o `role`.
Come le altre cartelle, rimangono completamente inattive sul VPS
senza il flag `AUTH_VTT_CAMPAIGN_NOTE_FOLDERS_ENABLED` e le migrazioni.
La UI originale e il flusso ripristino dal Cestino richiedono
ulteriore lavoro.

## Client Aruba cartelle — adattamento al contratto UI originale

Il modulo `apps/aruba-vtt-pilot/src/campaign-folders-client.mjs`
espone il trasporto cookie per elenco, creazione, cambio di nome/genitore,
icona/posizione e archiviazione semplice/con contenuto. I campi dei record
sono mappati sui nomi `Folder` originali (`entityType`,
`campaignId`, `parentFolderId`) e gli update parziali rileggono
prima la cartella autorizzata, perché le routine Aruba richiedono
una coppia completa nome+genitore oppure icona+posizione.
L'adapter non accetta ownerId, ruoli, Bearer/Supabase, né oggetti
di una sezione diversa da `gmnotes` o `campaignnotes`.
`validateBootstrap` verifica anche `campaignNoteFolders` e richiede
`campaignNotes` abilitato prima di accettare la capability.
La UI originale NON è ancora montata e il VPS non è stato modificato.

## Schema 020 — metadati Note per i componenti originali

Il nuovo lettore `list_member_campaign_notes_ui` espone `creator_id`
e `updated_at` solo dopo il filtro SQL per campagna e visibilità.
Il GM può leggere le Note private della campagna; i giocatori non
possono leggere Note private altrui o Note GM. La revoca si applica
immediatamente anche ai metadati del creatore.
Il servizio Aruba trasmette `creatorId` e `updatedAt`; il client
`toOriginalCampaignNoteTab` conserva il contratto
`EntityCustomTab` originale (`tab_name`, `content_rich`,
`hidden`, `folder_id`, `owner_profile_id`).
Nessun autore viene inventato: il nome utente per-note non può essere
ricavato da `campaignId`. `tab_order` e `title_icon` non vengono
falsamente indicati come persistiti prima della relativa migrazione.

Il montaggio del pannello originale resta disabilitato: manca il
salvataggio per membri/co-GM, oltre alle risorse del titolo e
dell'ordine dei sotto-tab. Nessun VPS modificato.

## Schema 021 — scrittura GM/autore per Nota, per campagna

Le routine `create_member_campaign_note`,
`save_member_campaign_note`, `archive_member_campaign_note` e
`assign_member_campaign_note_folder` convalidano il ruolo ricavato
da `campaign_member_role` e l'autore effettivo in PostgreSQL.
Il GM può creare e gestire Note GM o condivise nella propria campagna;
un giocatore può creare Note condivise e modificare, cestinare o
spostare solo quelle di cui è autore. Le sotto-tab richiedono anche
l'autorizzazione sul contenitore padre. Revoca e cross-campaign
bloccano le scritture. I documenti TipTap vengono archiviati senza
cancellazione fisica e non sono consentite cartelle di altre sezioni.
Il server usa sempre la sessione come identità e NON accetta ruoli,
`creatorId` o `ownerId` dal client. Gli endpoint esistenti restano
disabilitati per default, fino al deploy in staging isolato dei
successivi collaudi d'interfaccia.

## Schema 022 — coerenza autorizzazioni NoteSubTabs originali

La funzione di lettura verifica le sotto-tab private rispetto al
contenitore: l'autore della Nota padre legge e modifica le sotto-tab
anche se aggiunte dal GM. Altri giocatori non possono leggere
sotto-tab private di un contenitore pubblico; le sotto-tab GM restano
inaccessibili ai giocatori. `creatorId` continua a essere l'autore reale;
`editorOwnerId` rappresenta invece chi può usare i controlli originali
di modifica delle sotto-tab. Non viene sostituita l'identità dell'autore
sul server o nella tabella. Le autorizzazioni restano applicate in SQL.
Interfaccia ancora non montata, nessun deploy sul VPS.

## Schema 023 — elementi grafici e ordine originale delle Note

Le Note persistono `title_icon` per NoteListRow e `tab_order`
(JSONB: array ordinato di UUID) per NoteSubTabs. Le routine
`set_member_campaign_note_title_icon` e
`set_member_campaign_subtab_order` verificano i ruoli in campagna,
l'identità dell'autore del contenitore, l'assenza di duplicati e che
ogni elemento ordinato sia una sotto-tab attiva effettiva.
Il lettore membro non restituisce questi dati a utenti senza permessi.
I nuovi endpoint `PATCH /vtt/campaign-notes/icon/:id` e
`PATCH /vtt/campaign-notes/order/:id` usano cookie, Origin e payload
stretti. `toOriginalCampaignNoteTab` ora produce anche
`title_icon` e `tab_order` autentici: mai placeholder.
Nessun deploy del database e nessuna modifica alla UI o al VPS.

## Compilazione del vero useFolderSection originale, senza Supabase

`ArubaOriginalFolderTransport.mjs` adatta le firme del vecchio
`foldersService` all'API cookie Aruba. Il modulo TypeScript
`ArubaOriginalFolderService.ts` mantiene gli stessi tipi e helper
puri originali (breadcrumb, 5 livelli, DnD, conteggi), mentre il
resolver Vite sostituisce l'import Supabase **solo** quando il chiamante
è `useFolderSection.tsx`. I componenti e la gerarchia UI originali
rimangono immutati. `useArubaOriginalFolderSection` effettua il gate
di sessione attraverso un valore non segreto e non lo invia mai come
Bearer; lato server rimane il controllo della vera sessione cookie.
L'adapter conserva solo mapping autorizzati dei folderId e rifiuta
azioni con identificativi non letti dalla campagna corrente.

Il componente non è ancora montato nella navigazione: manca
l'integrazione dello stesso `useCampaignNotesSection` e del Cestino
originale. Questa fase non aggiunge menu alternativi e non attiva
alcuna funzionalità sul VPS.
