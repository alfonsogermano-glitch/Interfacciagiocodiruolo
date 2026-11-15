# Decisione UI del VTT (vincolo vincolante)
La migrazione Aruba NON deve reinventare la disposizione dei comandi.
Il codice originale di riferimento è:
- `src/app/layout/LeftSidebar.tsx`: colonna SINISTRA **100 px** con logo, Panoramica, Personaggi, Campagne, campagne selezionate.
- `src/app/layout/GmSectionSidebar.tsx`: colonna DESTRA **80 px** con sezioni e strumenti GM. Non spostare qui le funzioni della colonna sinistra e viceversa.
- `src/app/layout/TopBar.tsx` e `src/app/layout/AppShell.tsx`: preservare interazioni, map tool e posizione.
- `src/app/App.tsx`: recuperare le vere sezioni e i componenti, non sostituirle con un nuovo layout inventato.
La nuova combinazione cromatica nero/oro è la sostituta della palette Noir, ma NON della struttura o delle interazioni.
Le icone **Phosphor Duotone** della navigazione sono state approvate: nel portale Aruba sono consentite per le barre principali, con **PNG = Identification Badge** e **Mostri = Ghost**. La libreria non autorizza un redesign delle posizioni. Le altre icone specialistiche e le animazioni restano da valutare solo dopo il ripristino del VTT. Il confronto isolato rimane disponibile in `/vtt/icon-study`.
Obiettivo: sito utilizzabile il più presto possibile. Non lavorare su redesign generali mentre la migrazione delle funzioni è incompleta.

**Posizione vincolante della barra destra:** come nell'originale `AppShell`, la barra superiore occupa tutta l'area a destra della navigazione principale (compresi gli 80 px della futura barra GM). La colonna GM comincia solo **sotto** la barra superiore; la colonna sinistra da 100 px resta a tutta altezza. La zona centrale e la colonna GM scorrono indipendentemente. Non simulare il risultato con margini o overlay.

## Contratto di integrazione delle entità — NON ripristinare pagine legacy

Nel VTT originale il flusso è `App.tsx/rightSidebarContext` → `MyCharactersPage.tsx` → card `onOpenDetail` → pannello `SlideOverPanel` → `EntityDetailView` con rail contestuale `EntityDetailRail` (Scheda/Immagine/Token). La rail è fixed e non modifica la larghezza della griglia centrale. Nel contesto di sessione esiste invece `SessionRightSidebar` e il pannello Schede della sessione: condividono il modello di entità ma **non devono essere scambiati**.

Primo riallineamento Aruba: il contesto di dettaglio è stato **sollevato all'App**, il clic sulla card apre la vera `SlideOverPanel` e la vera `EntityDetailRail` invece di aggiungere una scheda sotto l'archivio. Il dettaglio è caricato nuovamente tramite l'API Aruba e l'identità della sessione. **Attenzione: contenuto Scheda ancora temporaneo**: fino all'integrazione completa di `EntityDetailView` con i servizi Aruba, `ArubaPersistedSheet` riutilizza il precedente tracker HSC (che salva correttamente) *esclusivamente all'interno* del pannello. Immagine e Token indicano esplicitamente la dipendenza dallo storage non ancora migrato. Non presentare questa versione come parità funzionale, non chiedere il deploy né rimuovere lo staging precedente prima di integrare la vista moderna.

L'obiettivo successivo è l'estrazione/riuso integrale di `EntityDetailView` con adapter per immagini, token, note e schede custom; evitare di importarlo con chiamate Supabase vive o di ricrearne versioni ridotte scollegate dai pannelli. Testare insieme apertura/chiusura, contesto, cambio tab, lettura/salvataggio e sincronizzazione con la lista.

Lo slide-over Aruba blocca l'interazione con le pagine sottostanti e verifica il completamento dei salvataggi pendenti prima della chiusura. Se il server non conferma l'ultimo salvataggio, resta aperto con errore visibile; i dati non vengono contrassegnati come salvati.

Il pannello Token usa adesso il vero `TokenStyleEditor.tsx` e `TokenShapePreview.tsx`, senza la raccolta asset legacy; salva in `sheet_data` dello stesso personaggio Aruba tramite la coda di aggiornamenti della vista Scheda. Il ramo Immagine non è ancora collegato perché richiede lo storage. Il vecchio contenuto `CompleteCharacterSheet` resta temporaneo nella sola sezione Scheda e non deve essere considerato la vista originale finale.

### Ripristino scheda moderna
Il branch Aruba ora importa direttamente il componente originale EntityDetailView e le sue cinque tab HSC. La rail Scheda/Immagine/Token resta esterna e condivide lo stato del pannello. Sono disabilitate le tab personalizzate e gli editor immagini fino al completamento di API e storage Aruba; i servizi Supabase non sono importati nel bundle. Le modifiche ai campi HSC e al Token Studio utilizzano la stessa coda di salvataggio PostgreSQL. La parità completa e il test browser rimangono obbligatori prima del deploy.

## Contratto del sistema originale delle Note (migrazione 013)

Le sottoschede di un personaggio sono entità persistenti distinte dalla scheda PG.
Il modello originale `EntityCustomTab` prevede: nome, ordine, contenuto legacy,
documento TipTap `content_rich`, stato hidden, visibilità all/private,
cartella, sotto-tab, proprietario e sincronizzazione realtime.

Preparazione completata: schema `013_vtt_entity_notes.sql`, funzioni PostgreSQL
SECURITY DEFINER e servizio API owner-only di lista/creazione/modifica/archivio,
con contenuto TipTap JSON conservato fedelmente. Client isolato
`entity-notes-client.mjs` mantiene il contratto dei campi base e cookie Aruba.
**Questo non equivale ancora all'editor Note recuperato**: duplicazione,
cartelle, sotto-tab, interazioni TipTap, modificatori, dadi, clipboard,
cronologia, visibilità fra membri e realtime devono essere migrati insieme,
senza simulazioni. Non usare `sheet_data` del PG per conservare queste note.

Le API hanno flag `AUTH_VTT_ENTITY_NOTES_ENABLED`, volutamente assente nella
configurazione di staging. La migrazione 013 è eseguita nel database usa-e-getta
della CI, non nell'attivazione del VPS finché tutto il sottosistema non
è pronto e verificato. Nessuna nuova richiesta al vecchio Supabase deve
essere introdotta.

## Correzione del confine Note / Personaggi
Il dettaglio originale di Personaggi (EntityDetailView.tsx) usa editor rich text direttamente nelle tab personalizzate. Il componente originale NoteSubTabs.tsx appartiene invece alle Note di campagna e ha profondità fissa di due livelli. Non sostituire le tab di Personaggi con NoteSubTabs: il backend 014 per l'annidamento resta predisposto e testato, ma deve essere collegato al contesto Note di campagna senza introdurre una nuova UI. Questo vincolo viene testato automaticamente.

## Vincolo dei due sistemi di Note — fase Aruba 014 (12/11/2026)

Il codice originale non tratta le tab dei personaggi e le Note di campagna allo
stesso modo: **EntityDetailView** monta **RichTextEditor** direttamente dentro la
tab personalizzata del PG; **NoteSubTabs** appartiene alle **Note di campagna**,
dove una nota è un contenitore di foglie scrivibili (profondità massima 2).
Non trasformare o uniformare queste due UX. Un test statico di regressione
impedisce che il plugin Vite Aruba sostituisca l'editor dei PG con NoteSubTabs.

Lo schema PostgreSQL Aruba 014 aggiunge una relazione padre/figlio opzionale
e tab_order non distruttivo a entity_notes, con funzioni SECURITY DEFINER
per accesso scoped, creazione figli, ordine completo e archiviazione che
mantiene i documenti. La API espone parentId opzionale e un endpoint dedicato
per l'ordine; il client può riprodurre il contratto dell'originale.

**Importante:** tali API 014 sono attualmente limitate al contesto proprietario
del PG, non sostituiscono ancora gli endpoint autorizzativi delle Note di
campagna (membri, GM, contenuti privati). Il VTT Aruba *non monta* ancora la
vista Note di campagna originale. I meccanismi di annidamento non vanno
presentati come visibili al giocatore finché campagna/permessi/cartelle
non sono migrati.

Il drag delle tab in Aruba adotta la soglia originale (6px) e aggiorna
l'ordine soltanto dopo il rilascio, anziché reinterpretare semplici click.
Gli editor TipTap della scheda PG rimangono identici all'originale.
