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
