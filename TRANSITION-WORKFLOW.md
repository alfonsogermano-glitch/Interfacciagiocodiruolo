# Hollowgate: transizione conservativa ad Aruba

Decisione del proprietario, 22 novembre 2026. Questo documento aggiorna il
metodo operativo; non dichiara conclusa la migrazione né autorizza deploy.

## Conservare il vecchio sito

- Non sostituire `main` con il pilot Aruba, non cancellare `src/`, i servizi
  originali o le migration Supabase. Sono ancora il riferimento per le parti
  non migrate; conservarli non autorizza a riattivarli nel runtime Aruba.
- Il lavoro corrente va in `tmp/aruba-transition-20261122`, separato da `main`
  e `feature/aruba-api-foundation`. Il prefisso `tmp/` è scelto perché il
  `vercel.json` esistente ne disabilita il deploy; non indica un branch da
  eliminare automaticamente.
- Riferimenti di conservazione locali, da pubblicare senza force quando
  GitHub è raggiungibile:
  - tag `archive/legacy-pre-aruba-20261122`: copia di `origin/main` disponibile
    localmente (`e9f31ab6d22ac84b7b28197c0274c7391120a975`). Non dichiararla
    ultima versione remota finché fetch non riesce.
  - tag `archive/aruba-foundation-pre-checkpoint-20261122`: HEAD precedente
    (`531c74840c3ca347ecffa1d3b748eb1981a8895f`).
- Nessun merge su `main`, force push, reset o rimozione dei branch precedenti.
  Il checkpoint comprende lavoro in corso, non una release pronta.

## Un solo ambiente di verifica funzionale

- `https://www.hollowgate.quest` su Aruba, con il database completo attuale,
  è l'ambiente operativo di riferimento durante la prova privata.
- Test automatici e build precedono ogni rilascio. Dopo il rilascio: controlli
  tecnici mirati e una verifica funzionale dell'utente, senza ripetere l'intero
  flusso su staging e sito pubblico.
- Staging rimane separato per rehearsal rischiose e prove di migration;
  attualmente non contiene tutti i dati storici. Non è uno specchio e non
  usare la sua assenza di contenuti come prova di perdita in produzione.
- Le migration si provano su clone. Non restaurare dump vecchi sopra account,
  campagne o identità OAuth creati nel frattempo. Backup e rollback della
  versione applicativa prima di ciascun rilascio. Non collegare account per
  sola uguaglianza dell'email.
- Ogni modifica effettiva al sito/database richiede il suo perimetro approvato:
  l'autorizzazione al checkpoint GitHub non è un deploy automatico.

## GitHub e computer diversi

- Il branch condiviso è la fonte del codice: commit revisionati e push senza
  force; sull'altro PC fetch e checkout del branch, dopo avere salvato il lavoro
  locale. Non modificare file direttamente sul VPS fuori dal rilascio tracciato.
- Il VPS conserva dati e media. GitHub non sincronizza database o segreti.
  Non configurare i PC come client SQL scriventi del database pubblico.
- Escludere credenziali, token, certificati, dump, export, log e screenshot
  non revisionati. Alcuni vecchi helper con credenziali incorporate restano
  soltanto locali e ignorati: non cancellarli, pubblicarli o usarli alla cieca.
- `deploy/aruba/production/production.env.example` è un template revisionato
  senza segreti, non una fotografia della configurazione live e non un file
  da applicare automaticamente al VPS.
- `LOCAL-WORKFLOW.md` descrive l'ambiente locale di test facoltativo precedente,
  non un secondo passaggio obbligatorio di accettazione.
- I report storici con parole come «100%», «certificato» o «completo» non
  certificano la parità pubblica. Fare riferimento alle evidenze e lacune
  registrate in `deploy/aruba/qa/RECOVERY-INVENTORY-2026-11-21.md` e ai successivi
  riscontri live; inviti/refresh staging confermati non equivalgono a realtime.

## Stato accertato dei dati storici

Il 21 novembre: in produzione «La scuola degli Orrori» è presente con 6 PG,
5 mostri e 3 PNG; il proprietario attivo/verificato la legge tramite routine
SQL. L'utente ha poi confermato di vedere nuovamente tutto. Questo riscontro
non è una verifica esaustiva di tutti i media o di ogni funzione del sito.
