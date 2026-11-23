# Checkpoint riparazione catalogo — 23 novembre 2026

## Ultimo incremento (`f2d6eb53`, dopo `787d3c80`)
- Nuovo catalogo PG logici `/vtt/catalog/logical-characters`: lettura paginata,
  creazione senza campagna, salvataggio CAS e archiviazione non distruttiva.
  Le nuove creazioni PG passano da questo modello, non dal catalogo nativo
  separato. I vecchi PG nativi restano conservati e distinti.
- Migrazione root 039: revisioni condivise con note/ritratti e vecchi writer;
  snapshot storici `sourceRecord` immutabili, placement/media conservati
  durante edit scheda, origini bloccate in campagna, nessuna resurrezione
  tramite vecchie PUT. Nessun backfill di proprietari.
- Il giocatore può salvare il PG reclamato mentre autorizzato; il GM fisico
  non può più archiviarlo o riassegnarlo dal catalogo. Revoca mantiene la
  proprietà congelata leggibile ma blocca scritture nella vecchia campagna.
- Archiviare o staccare l'ultimo PG logico del giocatore revoca la membership;
  archiviare uno di più PG non lo fa. Il PG staccato resta editabile/rilasciabile.
  Note, schede e bytes immagini rimangono nel DB.
- Duplicazione GM atomica e idempotente: crop/source, tab nascoste/private e
  sotto-tab, con UUID strutturali rimappati e testo originale intatto.
  **Duplicazione dei PG reclamati altrui ancora rifiutata (403)**: manca una
  proiezione approvata di materiale privato del GM, non aggirare questo guard.
- Difetti critici trovati in 038: `RETURN QUERY` non termina una funzione
  PL/pgSQL; il vecchio `IF NOT v_may_manage` con valore NULL poteva saltare il
  rifiuto; override GM confondeva proprietà fisica e logica. Corretti in 038
  per installazioni nuove e in 039 per aggiornamenti esistenti. Test con una
  ricostruzione della vecchia funzione verificano esattamente un esito e
  nessuna modifica al DB dopo i rifiuti.
- Gli spostamenti con cambio GM o dipendenze da rimappare sono ora rifiutati
  (409) PRIMA di mutare: evita note/media lasciate nel contesto sbagliato.
  Il motore di proiezione atomica rimane da completare.
- `AUTH_VTT_CHARACTER_CATALOG_ENABLED=true` abilita solo questo catalogo,
  subordinato a logical characters e preflight 039. Anche l'avvio del servizio
  logico base richiede il marker 039: non riattivare DB con vecchie funzioni
  vulnerabili. Nessuna variabile operativa modificata in questa tranche.
- Adapter originale collegato a create/save/archive/duplicate PG; refresh
  della revisione dopo assegnazione/disponibilità. Gli errori di salvataggio
  sono visibili, non soltanto loggati. Rimangono da completare queue/flush
  esaustivi di tutti i writer UI, note/media globali e prove browser pulite.
- Verifiche: API 298/298, frontend 518/518, QA DB/HTTP/provenienza 55 passati,
  0 falliti e 3 race PostgreSQL saltate. Entrambe le build riuscite; il
  bundle originale supera il controllo di assenza del client/SDK Supabase.
- Pubblicato su GitHub: `787d3c80`; working tree pulito e sincronizzato con origin.
- Nessun SQL, aggiornamento API o rilascio eseguito sul VPS. La ricostruzione
  integrale del sito NON è conclusa: vedi i gate sotto e il piano generale.

## Incremento precedente (`787d3c80`)
- Trancha 039 completa: catalogo PG logici revisionato (lista paginata, create
  in `character_drafts`, CAS save/archive), ownership coerente, dettaglio
  account e media/provenienza preservati; detach ultimo PG → membership
  revocata, PG editabile/rilasciabile; storico `sourceRecord` immutabile.
- Correzioni PL/pgSQL critiche in 038 (validate anche installazioni nuove):
  `RETURN QUERY` non termina la funzione; soggetto NULL non bypassa il rifiuto;
  distinzione fisica/logica nell'ownership GM. Test con ricostruzione della
  vecchia funzione: esattamente un esito e nessuna modifica al DB dopo rifiuti.
- Scrittori legacy: note/portrait invalidano la CAS; saves legacy invalidano
  CAS e non possono alterare provenienza importata.
- Duplicazione GM: atomica/idempotente (crop/source, tab nascoste/private e
  sotto-tab, UUID strutturali rimappati, testo originale). Duplicazione del
  PG reclamato da altri: rifiutata 403 (non c'è proiezione privata approvata —
  non aggirare questo guard).
- Adapter originale: create/save/archive/duplicate PG, refresh revisione dopo
  assegnazione/disponibilità, errori di salvataggio visibili (toast, non solo
  log). DA FARE: queue/flush UI, note/media globali, inviti con scelta PG,
  presenza/live, E2E browser, task PostgreSQL concorrente.
- Verifiche: API 298/298, frontend 518/518, QA DB/HTTP/provenienza 55 passati,
  0 falliti, 3 race PostgreSQL saltate; build pubblica e originale fatte;
  controllo assenza Supabase del bundle originale passato.

## Incremento precedente (`bc4c4c13`)
- Migrazione nativa 005 e API `/vtt/catalog/native/*`: lista/lettura/salvataggio,
  immagini, note, duplicazione e copia anche per record assegnati; PNG/Mostri
  assegnabili, spostabili e staccabili mantenendo lo stesso ID e tutti i dati.
- Archiviazione non distruttiva: conserva scheda, immagini e gerarchia note;
  chiude anche le vecchie API unassigned. Nessun contenuto storico modificato.
- La migrazione riusa le routine 001-004 con trasformazioni DB controllate:
  sorgenti univoche, anchor di scope esatto, fallimento atomico su drift,
  nuovi helper privati senza grant runtime. Trigger impedisce modifiche di
  record archiviati e campagne/ruleset non autorizzati.
- Startup nativo richiede ora 001-005 e verifica entrambi i set di routine.
- Adapter originale collegato a move/detach/archive PNG/Mostri e archive PG
  nativi. I PG logici/claimati NON passano dal lifecycle nativo.
- Tombstone browser e controllo proprietario impediscono che autosave tardivi
  ricreino contenuti archiviati o salvino bozze dell'account precedente.
- Verifiche: API 293/293, frontend 515/515, QA DB/HTTP/provenienza 45 passati,
  0 falliti, 3 race PG saltate. Build originale superata senza SDK Supabase.
- **Rilascio ancora bloccato**: storico/logical PG completo, proiezione dei
  nativi nei consumer di campagna, editor media/note, realtime e test browser
  puliti/reti/PG reale. Nessuna modifica a configurazione o database VPS.

## Incremento precedente (`740e695d`)
- Avvio API nativo finalmente collegato, ma SOLO con
  `AUTH_VTT_NATIVE_CATALOG_ENABLED=true`; nessuno script/configurazione attiva
  è stato modificato per abilitarlo. `configureNativeCatalog` verifica
  migrazioni 001-004 e privilegi ristretti prima di costruire catalogo+note.
- Bootstrap espone `nativeCatalog` solo quando configurato; NON `globalCatalog`.
  Il client valida la capability senza attivare automaticamente la UI.
- Nuova migrazione catalogo 004: chiude un difetto della 003, che controllava
  l'esistenza della campagna target ma non il suo GM/ruleset. Ora sorgente e
  destinazione sono bloccate, target deve appartenere all'attore ed essere
  compatibile. La vecchia implementazione non è più eseguibile dal runtime.
- Trasporto frontend immagini e note completo per i nuovi contenuti nativi:
  firma/MIME/base64/dimensioni, note/sotto-tab/ordine/archivio, controllo
  identità e revisione aggiornata. Non ancora collegato a tutti gli editor UI.
- Build di contratto monta il componente originale nella sezione Personaggi,
  senza nuova voce di menu né requisito di campagna selezionata. La build
  pubblica mantiene la UI precedente: nessuna attivazione del catalogo parziale.
- `ArubaCatalogTransforms.mjs`: creazione PNG/Mostro attende conferma e ID
  canonico del server; errore conserva bozza, doppio click bloccato, modifica
  successiva usa PUT sul nuovo ID e non una seconda POST. Sorgente originale
  invariata; trasformazione controllata e testata contro cambi upstream.
- Harness race riscritto: il vecchio aveva placeholder errati, più istruzioni
  in query parametrizzate, ruolo persistente nel pool, migrazioni ripetute e
  nessun guard sufficiente sul DB. Ora richiede `HG_DISPOSABLE_PG_RACE=1`,
  DB vuoto dedicato `hollowgate_race_*`, verifica identità reale e connessioni
  separate con transazioni e `SET LOCAL ROLE`. NON eseguito con PostgreSQL reale.
- Browser contract aggiunto, con `playwright-core` pinned e browser installato,
  server statico locale e API sintetiche. Le asserzioni applicative arrivano a
  verifica di tab, bozza fallita conservata, retry e modifica dell'ID canonico.
  **Il test integrale NON passa**: Chrome ed Edge locali ricevono script inline
  estranei con richieste a `filtering.adblock360.com` (già osservate nelle vecchie
  prove del repository). Richieste bloccate e errore `Failed to fetch`; nessuna
  occorrenza del dominio nel bundle. Non sopprimere genericamente gli errori
  applicativi per ottenere verde. Usare un browser/ambiente pulito per il gate.
- Verifiche finali: API 293/293, VTT 511/511; entrambe le build superate.
  QA DB/provenienza/lifecycle/catalogo/configurazione race: 39 passati,
  0 falliti, 3 prove multi-connessione PG saltate. Tra questi, 6 verificano
  SQL catalogo 004 e preflight con ruolo runtime reale, incluso rifiuto quando
  manca il grant media o la vecchia implementazione risulta accessibile.

## Vincoli e autorizzazioni
- Branch di lavoro: `tmp/aruba-transition-20261122`; non modificare `main`.
- Commit/push GitHub autorizzati; rilascio catalogo autorizzato separatamente
  ma subordinato a backup, preflight, rollback e verifiche effettive.
- Origine pubblica: `https://www.hollowgate.quest`.
- Nessun ripristino arbitrario delle proprietà storiche; nessuna dipendenza
  Supabase a runtime; non chiedere password o divulgare segreti.
- L'utente interviene nella console VPS solo se servono privilegi interattivi.

## Audit e riparazioni
- HEAD iniziale `99459710`. UI locale precedente non committata e non pubblicata.
- `main.tsx` aveva JSX e codifica danneggiati: riparati, preservando le funzioni
  preesistenti. Rimossi gli effetti dello script generato `fix_main.py`.
- Separato il componente originale in `ArubaOriginalCatalog.tsx`, con i suoi
  veri props e un contesto dedicato (non il contesto della singola campagna).
- Build pubblica: boundary `ArubaCatalogUnavailable.tsx`, nessuna voce di
  navigazione catalogo attivata. NON presentare questo come recupero completo.
- `HG_CATALOG_CONTRACT=1` seleziona il componente originale SOLO nella build
  di contratto. Non è una capability API né una variabile di rilascio.
- Adapter precedente sostituito: niente revisioni fisse, cancellazioni vuote
  o assegnazioni trasformate in copie. Azioni non migrate falliscono esplicitamente.
- `catalog-client.mjs`: paginazione completa, controlli proprietario/identità,
  revisioni osservate, errori HTTP propagati e campi originali preservati.
- Duplicazione note: successo solo dopo conferma della duplicazione atomica
  del catalogo, non un no-op incondizionato.
- Corretto un bug API: la lista globale logica intercettava e respingeva
  anche `GET /vtt/characters?campaignId=...`. Aggiunta regressione HTTP.
- Aggiunto blocco del client legacy per utility originali con import misti;
  il proxy non consente né Supabase né un fallback silenzioso a IndexedDB.
- Test frontend aggiunti: trasporto catalogo, validità TSX/codifica,
  isolamento pubblico e rifiuto esplicito delle operazioni non migrate.

## Verifiche della prima tranche (`ced244dc`)
- API: 288/288 superati dopo la correzione del routing.
- Frontend: 501/501 superati nell'ultima esecuzione prima del checkpoint.
- Build pubblica riparata: superata anche dopo il boundary di blocco.
- Build originale `HG_CATALOG_CONTRACT=1`: superata con controllo dei moduli
  realmente inclusi nei bundle; nessun client/SDK Supabase incluso.
- Nessuna verifica browser autenticata, prova PG multi-connessione,
  backup produzione o distribuzione VPS eseguita in questa tranche.

## Lavoro ancora necessario prima del rilascio
1. Mantenere verdi entrambe le build e i test dopo le prossime modifiche
   (ricorsione QA minimale: suite aruba-api, aruba-vtt-pilot, QA DB 038/039).
2. Completare listing globale PNG/Mostri storici e assegnati: l'adapter attuale
   legge solo il catalogo nativo non assegnato e NON deve nasconderlo all'utente.
3. Lifecycle nativo implementato e testato (done in `bc4c4c13`); completare le corrispondenti azioni
   sui contenuti storici con provenienza e ownership autorevoli.
4. Save/archive PG logici e duplicazione GM implementati (done in `787d3c80`).
   Completare: duplicazione del reclamato con proiezione privata approvata,
   media/note globali, inviti con scelta PG, presenza/live, queue/flush UI.
   Non aggirare il 403 di duplicazione del reclamato senza proiezione approvata.
5. Avvio/capability nativi collegati (done in `bc4c4c13`); completare il
   servizio globale storico, la proiezione delle copie native nei consumer di
   campagna e relativi test.
6. Montaggio nella sezione Personaggi fatto nella build di contratto; completare
   ogni azione esposta prima di promuoverlo nella build pubblica.
7. Test end-to-end browser con account GM/giocatore e PG/PNG/Mostri;
   prove race su PostgreSQL usa-e-getta, non sul DB operativo.
8. Solo dopo: procedura rilascio con backup/rollback,
   eventuale comando sudo per operatore VPS, smoke test sull'origine pubblica.
9. Storico PNG/Mostri (estrazione storica): DONE - endpoint read-only `'/vtt/storico/png-mostri`, vista SQL 040_vtt_storico_png_mostri.sql, funzioni list_storico_png_mostri/read_storico_png_mostri, transport adapter loadStoricoPngMostri. Verdi: API 299/299, frontend 520/520, DB storico 1/1.
10. Proiettare i nativi nei consumer di campagna; editor media/note globali; completare duplicazione del reclamato con proiezione approvata; poi E2E browser/PG reale; poi procedura rilascio.

## Comunicazione e risparmio contesto
Risposte brevi in italiano. Riportare soltanto verifiche realmente eseguite.
Leggere questo checkpoint per riprendere, non ricostruire tutta la conversazione.
Non attribuire identità di modelli/AI agli autori Git senza evidenza.
