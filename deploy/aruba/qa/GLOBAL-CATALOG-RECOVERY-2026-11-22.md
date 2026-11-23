# Cataloghi globali — confronto sorgenti e primo incremento locale

Aggiornamento del 23 novembre: primo storage/API per **nuovi contenuti senza
campagna**, note/sotto-tab e duplicazione atomica, ancora disattivati e senza
backfill, descritti in `UNASSIGNED-CATALOG-BACKEND-2026-11-23.md`. Le sezioni
sotto conservano il checkpoint del 22; il recupero globale completo rimane
aperto.

**Parziale, non pubblicato.** Nessuna migrazione catalogo applicata, nessuna
modifica a database/account/configurazione Aruba o staging. Il componente
originale non è ancora montato nel VTT Aruba. Questo documento non certifica
né la parità visiva né il completamento delle azioni.

## Baseline effettivamente letta

- `src/app/components/gm/MyCharactersPage.tsx`, fino alla fine (2082 righe).
- `src/services/supabase/{charactersService,entitiesService,entityNotesService}.ts`.
- Server originale `supabase/functions/server/index.tsx`: assegnazione PG
  (1184–1304) e rilascio (1538–1619); altri percorsi server/dettaglio/join
  richiedono ancora confronto puntuale prima del porting.
- API Aruba character/narrative, schema draft/assignment/claim, ledger e
  routine di migrazione storica. Le conclusioni sui dati sono **da codice**,
  non nuovi conteggi del database pubblico.

## Azioni originali da recuperare senza inventarne altre

| Area | Comportamento osservato | Differenza Aruba da risolvere |
|---|---|---|
| Elenco globale | Liste per proprietario, non soltanto campagne possedute; PG logici del giocatore inclusi | Non aggregare indiscriminatamente i PG fisicamente appartenenti al GM |
| Creazione | Wizard PG con ruleset; PNG/Mostro come bozza nel pannello; nessuna campagna obbligatoria | Storage e validatori correnti richiedono campaign UUID |
| Filtri | Tre tab, ricerca, ordinamento nome/data, griglia/lista, 12 elementi iniziali, regole; campagna PG e gerarchia campagna/capitolo PNG/Mostri | Riutilizzare toolbar, card, menu e paginazione originali, senza conteggi fissi |
| Modifica | Wizard PG e dettaglio originale con rail; note, immagini, token e schede personalizzate | Trasporto cookie Aruba; salvataggi riconosciuti dal server, non legacy auth/realtime/fetch |
| Duplica | Tutti e tre: nuova identità, `Copia di …`, stessa campagna/placement; note comprese tab nascoste e sotto-tab | Operazione atomica, non inserimento entità seguito da N richieste browser |
| Copia tra campagne | Menu PNG/Mostri e dialog campagne possedute compatibili; originale invariato | Risolvere placement, media e riferimenti in transazione |
| Assegna PG | Campagne possedute/partecipate compatibili oppure codice invito; iscrizione e distacco precedente lato server | Non confondere assegnazione **alla campagna** con `character_player_assignments` |
| Assegna PNG/Mostri | Campagna posseduta compatibile, ruleset storico nullo ereditato dalla destinazione | Non fidarsi di ownerProfileId contenuto nel JSON |
| Rimuovi da campagna | Entità resta nel catalogo; PG può causare uscita implicita se ultimo PG attivo del giocatore | Non cancellare contenuto/ownership per simulare il distacco |
| Disponibilità PG | Solo GM della campagna, toggle mantiene menu aperto; origine precompilata persistente | Separare stato corrente e origine storica; non esporre toggle al giocatore |
| Richiedi PG | Precompilati altrui autorizzati, separati dai propri; richiesta concorrente atomica | Current claim è autorevole, assignment-only non trasferisce proprietà |
| Rilascia PG | Ritorna al proprietario originale, statistiche/tab intatte; possibile anche dopo distacco dalla campagna | Claim attuale legato a campagna/membership non basta per questo intero ciclo |
| Elimina | Conferma e semantica server originale, comprese dipendenze e uscita implicita PG | Archive draft attuale non prova equivalenza a eliminazione originale |
| Aggiornamenti | Liste, roster e presenza GM aggiornati dai canali originali | Non dichiarare realtime recuperato con un refresh o uno stub |

Distinzioni importanti per non ampliare la UI:

- `copyCharacterToCampaign` esiste nel servizio, ma il menu PG di questa pagina
  espone **Duplica**, non il dialog di copia tra campagne. Non aggiungerlo al
  menu per sola simmetria con PNG/Mostri.
- `duplicateEntityNotes` copia anche sotto-tab/nascoste. Le funzioni originali
  `copyNPCToCampaign` / `copyMonsterToCampaign` non invocano questa copia note:
  distinguere duplicazione e copia, prima di definire il contratto finale.
- La copia narrativa elimina chapter/environment nel servizio, ma può lasciare
  altri riferimenti scoped. Non replicare riferimenti impossibili su Aruba:
  la politica finale deve essere esplicita e testata, non cancellare campi a
  tentativi dopo un errore FK.
- PNG «Richiedibile» e filtri futuri per parole chiave sono predisposizioni
  originali inattive, non nuove funzionalità da abilitare.

## Invarianti del modello globale da implementare

Questi sono requisiti del modello, **non tabelle/routine già implementate**.

1. Identità catalogo stabile e tipizzata; possesso logico autorevole lato DB,
   separato da owner fisico usato dalle routine campagna correnti. JSON di
   scheda/payload, email, nomi, presence e campagna selezionata non conferiscono
   diritti. `ownerProfileId` del trasporto originale deve essere un risultato
   del server, mai un input di autorizzazione.
2. Assegnazione logica nullable. `[Recupero] Contenuti non assegnati` è un
   contenitore tecnico, non prova di assegnazione voluta dall'utente. Nemmeno
   nome della campagna o `sheet_data.sourceRecord` provano l'assenza logica di
   campagna. Ricostruire provenienza dal ledger amministrativo e dalla mappa
   deterministica effettiva della migrazione, con collisioni/mancanze esplicite.
3. Provenienza importata resta distinta dallo stato operativo attuale. Claim
   corrente prevale sul vecchio owner del ledger; assignment concede controllo,
   non possesso. L'assenza di claim **non prova** che il vecchio proprietario
   debba essere ripristinato: può essere effetto di rilascio o revoca successivi.
4. Il ciclo di vita deve conservare origine precompilata e proprietario di
   restituzione anche quando l'assegnazione campagna diventa null. Prima di
   cambiare i trigger di revoca distinguere distacco volontario, release e
   revoca di sicurezza; non riattivare un claim dopo una revoca.
5. Le narrative sono oggi identificate da `(id,campaign_id,kind)`. Prima di
   usare il solo id per catalogo/detail/note provare unicità o mantenere una
   mappa esplicita; vietati join che espandono una sorgente in più entità.
6. Ogni move/duplicate/copy/delete è una transazione DB con controlli del ruolo
   corrente, locks coerenti e rollback di entità, gerarchia note e media.
   Riferimenti condivisi non devono trasferire accesso ai media del vecchio GM;
   URL contenenti una campagna non si correggono con una sostituzione stringa.
7. Il server deve convalidare ruleset, membership, invito, placement e media.
   Il vincolo «un PG» del claim non va esteso all'assegnazione ordinaria:
   l'endpoint originale distingue esplicitamente i due casi.
8. UI originale mantenuta, con boundary trasporto esplicito. Nessun falso
   successo: draft conservata se fallisce la creazione, errori visibili,
   queue dei salvataggi prima di distacco/release/copia/chiusura, reload solo
   su acknowledgement valido. Non importare i servizi Supabase a runtime.

Scelta delle tabelle, backfill e precedenze nei casi ambigui ancora da chiudere.
Non rendere nullable `campaign_id` nelle tabelle attuali senza riscrivere e
testare tutte le routine, note/media e guardie che si appoggiano al GM fisico.
Non creare nuove campagne fittizie per mascherare il problema nel catalogo.

## Incrementi realizzati in questo checkpoint

### Diagnosi amministrativa esclusivamente in lettura

`catalog-provenance-audit.sql`:

- transazione REPEATABLE READ READ ONLY con timeout e ROLLBACK;
- solo conteggi per kind/metric, senza ID, email, nomi, note o schede;
- distingue dati attuali, ledger, origini senza campagna, origine ignota,
  target mancanti/ambigui, identità narrative duplicate e record senza ledger;
- confronta owner storici UUID e fisici senza usare campi browser-writable;
  owner legacy non UUID restano da mappare/revisionare, non diventano UUID per
  supposizione; provenienze multiple non entrano nel confronto ownership;
- distingue claim e assignment, divergenze di contesto/giocatore e membership
  corrente; un assignment senza claim è osservazione, non necessariamente errore;
- mancanza di ledger/schema/privilegi causa errore, mai un falso catalogo vuoto.

`current_rows` include ogni stato memorizzato, non soltanto entità attive.
I contatori assenti nei gruppi rappresentano zero; nessun risultato è una
decisione di autorizzazione o un piano di ripristino automatico. Una sorgente
originariamente senza campagna può ora avere collocazione differente: il
contatore `historically_unassigned` non afferma lo stato logico attuale.

**Non eseguita sul VPS.** Non allargare i privilegi del ruolo API per eseguirla.
Quando necessaria, usare soltanto un accesso amministrativo di lettura già
autorizzato; niente password o stringhe di connessione in comandi condivisi.

Test con PostgreSQL reale incorporato PGlite (fixture artificiali, non dump):
7/7 passati. Inclusi prima/dopo release simulato, assignment-only, JSON sorgente
forgiato ignorato, campo campagna mancante vs null, collisioni narrative,
provenienze multiple, UUID testuali maiuscoli, owner legacy, claim incoerenti, rifiuto DML e accesso
senza SELECT, errore senza ledger. Ulteriore caso esegue **tutte le migrazioni
root 001–034**, chapter/scene/visual-assets/narrative e ledger reali: query
compatibile e accesso negato al ruolo `hollowgate_api_runtime` invariato.

La prima esecuzione di quest'ultimo caso ha rilevato una dipendenza mancante
nel solo harness (visual_assets); corretta aggiungendo la migrazione reale,
senza stub, senza cambiare la SQL applicativa o indebolire il test.

### Date PG conservate nel boundary client Aruba

`validateCharacterDraft` scartava `createdAt`/`updatedAt` già restituite dall'API.
Ora conserva le date server valide e rifiuta valori presenti non leggibili;
risposte precedenti senza date restano compatibili, senza inventare «adesso».
Questo abilita trasporto delle date per footer/ordinamento originali, **non**
il montaggio del catalogo. Nessun campo ownership aggiunto o reinterpretato.

5 nuovi test: validazione, compatibilità senza date, date malformate, tutte
le liste owner/claimable/assigned e differenza ordine creazione/modifica.
Suite VTT completa: **490/490**. Build VTT riuscita; warning già presente
sulla dimensione del bundle, non risolto da questo incremento.

## Prossimo incremento necessario prima di qualsiasi rilascio catalogo

- Completare confronto di join, note/media e detail adapter originali.
- Chiudere modello logico e backfill revisionato senza resuscitare vecchi owner;
  provare nuovi contenuti null-campaign e media indipendenti dalla campagna.
- Implementare transazioni e API globali sotto ruolo runtime ristretto;
  testare concorrenti claim/release, distacco/revoca, copy rollback, isolamento
  cross-owner e sotto-tab nascoste con media reali.
- Montare il componente originale soltanto quando ogni azione esposta ha un
  contratto reale; confronto browser e validazione su Aruba nel perimetro di
  un rilascio successivo autorizzato separatamente. Nessun test manuale
  duplicato richiesto all'utente in questo checkpoint.
