# Audit generale e parità 100% — Hollowgate VTT, prerequisito al cutover Aruba

**Stato: APERTO / NON CERTIFICATO.** Repository `alfonsogermano-glitch/Interfacciagiocodiruolo`. Baseline: codice sorgente originale in `src/app/**`, non le schermate dimostrative del pilot. Aruba: PR #52, ramo `feature/aruba-api-foundation`. Data della prima ricognizione: 12 novembre 2026.

## Decisione vincolante

Non distribuire il VTT definitivo, non dichiarare "100%" e non chiudere questa revisione prima che ogni schermata originale e ogni flusso operativo siano mappati, implementati e verificati *nel browser contro API e PostgreSQL effettivi*, con parità visiva approvata. Il nero/oro e le icone Phosphor Duotone sono variazioni **deliberate e approvate**; spostamenti dei comandi, schermate alternative, sezioni svuotate e modifiche a tipografia, layout o comportamento non lo sono. `main` e VPS non vengono cambiati da questo audit.

## Evidenze già controllate (non estrapolazioni)

- Originale: `src/app/App.tsx` importa `AppShell`, `TopBar`, `LeftSidebar`, `GmSectionSidebar`; la parte centrale contiene `CampaignHome` e i gestori originali, con la barra destra separata.
- Originale: `LeftSidebar.tsx` usa **100 px**, `GmSectionSidebar.tsx` **80 px**. `AppShell.tsx` rende la barra superiore nell'area destra della sidebar sinistra, *sopra* la colonna GM.
- Pilot: `apps/aruba-vtt-pilot/src/main.tsx` crea direttamente `workspace`, `primary-sidebar`, `topbar`, `gm-sidebar` e una mappa manuale di sezioni. Non monta ancora tutto `AppShell` né `TopBar` originali.
- Differenza di navigazione: `main.tsx` ha una voce autonoma **Note** nella barra destra; `GmSectionSidebar.tsx` originale non contiene tale voce. `SessionNotesPanel.tsx` fa parte del contesto di sessione. Questo va riconciliato, non consolidato come nuova UX senza approvazione.
- Il pilot usa ancora segnaposto per numerose sezioni GM (mappe, scene, PNG, Mostri, oggetti e altro). Un pulsante visibile non dimostra che il relativo modulo sia stato migrato.
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
| P0 | Mappe, scene e strumenti TopBar | Da migrare | Pan/zoom, griglie, nebbia, testo, disegno, misure, layer e storage testati |
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
