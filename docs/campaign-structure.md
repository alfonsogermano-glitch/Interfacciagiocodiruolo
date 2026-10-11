# Struttura della campagna

## Gerarchia canonica

Il dominio narrativo del VTT usa una sola gerarchia:

```text
Campagna
└── Capitolo
    └── Scena
```

- **Campagna**: contenitore complessivo del gioco, dei partecipanti e degli archivi.
- **Capitolo**: blocco narrativo della campagna. È il termine unico per ogni genere e regolamento.
- **Scena**: unità concreta giocabile, preparata privatamente dal GM e collegabile a un luogo opzionale. Il luogo è riutilizzabile; la scena descrive ciò che accade.

Il termine precedente "Avventura" resta soltanto nei migratori necessari a leggere dati creati dalle versioni precedenti; non appartiene più al dominio o all'interfaccia.

## Cutover spaziale: i luoghi diventano Capitoli

Il vecchio dominio "Ambienti/Luoghi" (`environments`) è un **macro-luogo** del nuovo dominio:

- una **Environment radice** (senza genitore) diventa un **Capitolo**, mantenendo il suo UUID quando possibile e conservando in `sourceEnvironment` (e `locationMetadata`) l'intera riga originale;
- una **Environment figlia/discendente** diventa una **Scena** del Capitolo della sua radice, con `environmentId` di compatibilità;
- le entità collegate (`npcs`, `monsters`, `clues`, `situations`) ricevono `chapter_id`/`scene_id` ma **non perdono** `environment_id`.

Regole del cutover:

- **Le Environment non vengono mai cancellate**: restano come storage di compatibilità e come input di migrazione (locale, backup, SQL). L'interfaccia "Luoghi" è stata rimossa, ma i dati restano intatti e rileggibili.
- La migrazione è **idempotente e senza duplicati**: una Fonte ambiente già convertita (marker `sourceEnvironment.id`) viene riusata; se uno UUID di destinazione è già occupato da un capitolo/scena scritto a mano, viene generato un UUID di sostituzione persistente.
- La conversione avviene in tre punti: migration SQL `20261010140000_environment_chapter_scene_cutover.sql` (con tabella `environment_narrative_mapping`), migrazione client in `ChapterManager` al caricamento (merge/persist di Capitoli/Scene) e normalizzazione dei backup all'export/import.
- La navigazione dagli archivi (Mostri, Archivio Oggetti) punta al tab Capitoli e accetta sia `entityType: 'chapter'` sia `entityType: 'environment'` con il vecchio ID: il `ChapterManager` risolve gli ID legacy tramite i marker persistiti (`spatialDomainMigration.ts`). Il tab `environments` resta mappato su `chapters` per retrocompatibilità, senza voce attiva nella sidebar.

## Gestione e sessione

La gestione strutturale è separata dalla sessione live:

- La **Gestione campagna**, accessibile solo al GM, crea e organizza capitoli, scene ed entità dell'archivio.
- La **Sessione di gioco** pubblica una scena preparata e consente modifiche operative: scena attiva, token, visibilità, condizioni, valori temporanei e inserimento di entità già esistenti.
- Gli elementi improvvisati durante la sessione appartengono inizialmente alla scena; il GM può successivamente promuoverli nell'archivio della campagna.
- La sessione non crea o riorganizza la struttura dei capitoli.

Regola architetturale: **la gestione modifica il mondo della campagna; la sessione modifica lo stato corrente della scena**.

### Pubblicazione della Scena attiva

La pagina Gestione → Scene carica i Capitoli e le Scene persistenti. Soltanto una Scena con stato `ready` può essere pubblicata. La pubblicazione crea un nuovo snapshot runtime `active-scene`: modificare successivamente la Scena preparata non cambia ciò che vedono i giocatori finché il GM non la ripubblica.

Lo snapshot contiene esclusivamente dati pubblici: identificativi, titolo e descrizione per i giocatori, Capitolo, mappa, griglia, regioni e variante contestuale. Le `notes` della Scena non vengono copiate. La migration `20261011100000_active_scene_publication.sql` consente ai membri della campagna di leggere soltanto il documento `active-scene`; gli altri `campaign_documents` e tutte le Scene sorgente restano privati del proprietario. Un vincolo JSON impedisce inoltre di inserire per errore `notes`, `gmNotes` o `sourceEnvironment` nello snapshot pubblico.

Il cambio o la rimozione della Scena attiva viene persistito e inviato in tempo reale come `active_scene_change`. Quando la sessione parte, `CampaignHome` lascia posto a `SessionWorkspace`: albero Capitoli/Scene a sinistra, mappa dell'ultimo Capitolo pubblicato al centro e menu sessione a destra. Il GM carica l'intero albero privato e può pubblicare una Scena pronta con un click; il giocatore riceve soltanto il Capitolo e la Scena pubblicati, senza interrogare le tabelle private. Terminare la sessione non elimina `active-scene`, così la successiva apertura ripristina l'ultima mappa giocata. `active-encounter` resta un documento distinto per Combat Tracker e composizione dell'incontro.

La home della campagna non mostra più un riquadro Scena attiva. L'accesso **Gestione campagna** è nel menu a tre puntini accanto a **Invita giocatori**, immediatamente dopo **Impostazioni Campagna**.

## Persistenza

Il contratto canonico usa:

- tipo `Chapter` e proprietà `chapterId` / `nextChapterIds`;
- tabella PostgreSQL `chapters` e colonne `chapter_id` / `next_chapter_ids`;
- chiavi locali e collezioni `chapters`;
- backup **versione 3** con `data.chapters` e `data.scenes` (le `data.environments` restano solo come input di compatibilità del cutover).

I backup versione 1 (`adventures`) e 2 restano importabili: all'import vengono normalizzati sul dominio capitoli e i luoghi legacy vengono convertiti in Capitoli/Scene senza duplicare gli elementi già presenti (`migrateBackupToSpatialDomain` in `spatialDomainMigration.ts`).

Le scene usano il tipo `Scene`, la tabella/collezione `scenes` e i campi `chapterId`, `environmentId`, `sortOrder` e `nextSceneIds`. La tabella applica una relazione composita che impedisce di collegare la scena a un capitolo di un'altra campagna; luogo e scene successive devono appartenere alla stessa campagna, e le diramazioni restano nello stesso capitolo. Le policy RLS consentono CRUD soltanto al proprietario GM.

L'editor strutturale delle scene vive nel dettaglio del capitolo. Stato, ordine, descrizione, note GM, immagine, luogo e diramazioni sono preparazione persistente; `active-encounter` resta invece uno snapshot runtime separato e non è una Scena persistente.

La migration `supabase/migrations/20261010120000_chapters_domain_rename.sql` rinomina i dati PostgreSQL in transazione mantenendo UUID, relazioni e comportamento `ON DELETE SET NULL`. I migratori client convertono una volta storage locale, Tauri e backup versione 1.

La migration `supabase/migrations/20261010130000_campaign_scenes.sql` crea il dominio Scene persistente, i vincoli di integrità, il cleanup dei collegamenti e le policy private del GM.

La migration `supabase/migrations/20261010140000_environment_chapter_scene_cutover.sql` converte le Environment in Capitoli/Scene mantenendo le sorgenti come compatibilità, con mapping persistente e idempotente (`environment_narrative_mapping`). La conversione locale e la normalizzazione dei backup sono verificate dal verifier puro TypeScript `scripts/verify-spatial-domain-migration.mts` (`npm run verify:spatial-domain-migration`, incluso in `precheck`).

La migration `supabase/migrations/20261011100000_active_scene_publication.sql` abilita la lettura member-only del solo snapshot pubblico `active-scene` e ne impone la forma sanitizzata. `scripts/verify-active-scene-publication.mjs` verifica RLS, isolamento degli altri documenti, divieto di scrittura ai membri, forma pubblica e idempotenza; `scripts/verify-active-scene-browser.mjs` verifica mappa/regioni e separazione delle note GM in Chromium.
