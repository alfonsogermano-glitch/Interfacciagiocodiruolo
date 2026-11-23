# Checkpoint riparazione catalogo — 23 novembre 2026

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

## Verifiche
- API: 288/288 superati dopo la correzione del routing.
- Frontend: 501/501 superati nell'ultima esecuzione prima del checkpoint.
- Build pubblica riparata: superata anche dopo il boundary di blocco.
- Build originale `HG_CATALOG_CONTRACT=1`: superata con controllo dei moduli
  realmente inclusi nei bundle; nessun client/SDK Supabase incluso.
- Nessuna verifica browser autenticata, prova PG multi-connessione,
  backup produzione o distribuzione VPS eseguita in questa tranche.

## Lavoro ancora necessario prima del rilascio
1. Mantenere verdi entrambe le build e i test dopo le prossime modifiche.
2. Completare listing globale PNG/Mostri storici e assegnati: l'adapter attuale
   legge solo il catalogo nativo non assegnato e NON deve nasconderlo all'utente.
3. Implementare transazioni distinte per assegnazione/spostamento, rimozione
   dalla campagna e archiviazione catalogo; oggi falliscono esplicitamente.
4. Completare salvataggio/duplicazione PG logici e reclamati, media, note,
   inviti con scelta del PG, presenza e aggiornamenti live. Non aggirare i
   controlli delle revisioni né le autorizzazioni.
5. Collegare servizi catalogo e note in `index.mjs` con capability API reale,
   opt-in e test di avvio; attualmente volutamente non istanziati.
6. Montare il catalogo nella sezione originale Personaggi, senza inventare
   un nuovo requisito di campagna selezionata o una voce GM aggiuntiva.
7. Test end-to-end browser con account GM/giocatore e PG/PNG/Mostri;
   prove race su PostgreSQL usa-e-getta, non sul DB operativo.
8. Solo dopo: commit/push verificati, procedura rilascio con backup/rollback,
   eventuale comando sudo per operatore VPS, smoke test sull'origine pubblica.

## Comunicazione e risparmio contesto
Risposte brevi in italiano. Riportare soltanto verifiche realmente eseguite.
Leggere questo checkpoint per riprendere, non ricostruire tutta la conversazione.
Non attribuire identità di modelli/AI agli autori Git senza evidenza.
