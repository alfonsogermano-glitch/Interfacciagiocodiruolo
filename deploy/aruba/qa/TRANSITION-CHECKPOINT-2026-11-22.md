# Checkpoint conservativo del lavoro Aruba

Autorizzazione dell'utente: commit/push del lavoro revisionato, conservando il
vecchio codice perché la transizione è incompleta. Non autorizza merge su main,
force push, cancellazione sorgenti, deploy o modifiche ai database.

## Conservazione

- Branch di lavoro: `tmp/aruba-transition-20261122`; deployment Vercel escluso
  dalla policy `tmp/**` già presente. Workflow Aruba di push limitato al vecchio
  branch feature; il workflow CI generale può comunque partire su GitHub.
- `main` locale conservato a `6f11825920ee0554472f58cd8e26f10f905d8686`.
- Branch `feature/aruba-api-foundation` conservato a
  `531c74840c3ca347ecffa1d3b748eb1981a8895f`.
- Tag di archivio documentati in `TRANSITION-WORKFLOW.md`.
- Bundle locale completo della cronologia prima del checkpoint creato e
  verificato, esterno al repository. Non contiene file ignorati o modifiche
  non committate; il successivo checkpoint conserva i sorgenti modificati.
- Nessun sorgente precedente cancellato. Vecchi helper con credenziali
  incorporate conservati soltanto localmente e aggiunti a `.gitignore`;
  esclusi anche dump, export privati, certificati, log e screenshot generati.

## Verifiche locali ripetute

- API: 264/264 test passati.
- VTT: 473/473 test passati.
- Auth web + collector/confronto schema + recovery PostgreSQL embedded +
  diagnosi storica: 33/33 test passati.
- Python recovery: 14/14; Python release/auth Caddy: 9/9.
- TypeScript del progetto originale: passato.
- Build progetto originale e VTT Aruba: passate, con warning dimensioni chunk.
- Manifest e lockfile dei tre package coerenti.
- Navigation contract: passato, senza promuovere il gate di release.
- Audit di parità: **fallisce ancora su due gate del branding**,
  `visualBaselineApproved` e `browserRealApiDatabasePassed`. Non modificati.
  Il checkpoint non corregge né nasconde tale contraddizione storica.
- Controllo euristico credenziali sui file candidati: esclusi sette helper
  legacy sospetti; negli altri riscontri rilevati solo fixture di test o
  riferimenti a variabili. Non è una certificazione di sicurezza completa.

## Limiti della sincronizzazione

Al momento della preparazione GitHub non è raggiungibile da questo computer:
fetch/ls-remote scadono e anche HTTPS di base verso github.com va in timeout.
Non rappresentare il commit locale come già sincronizzato con GitHub o
disponibile su altri PC finché un push esplicito e la verifica remota non
riescono. Non aggirare il problema con upload a servizi terzi.

I report di parità/certificazione precedenti restano documenti storici.
Lavoro preservato non significa funzionalità completata o pubblicata.

### Aggiornamento: sincronizzazione GitHub completata

Dopo il ripristino della connessione segnalato dall'utente, push atomico
riuscito del branch `tmp/aruba-transition-20261122` (checkpoint `d6cee3d1`)
e dei due tag di archivio. Verifica `ls-remote` successiva conferma branch
e target dei tag; `main` remoto resta a `e9f31ab6` e il precedente branch
foundation a `531c7484`. Upstream configurato, working tree pulito.
Il blocco di rete sopra descrive il primo tentativo ed è ora superato.
Nessun force push, merge, deploy o modifica dati in questa operazione.
