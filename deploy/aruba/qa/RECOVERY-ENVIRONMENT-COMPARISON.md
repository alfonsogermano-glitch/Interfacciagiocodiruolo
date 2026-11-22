# Confronto ripetibile degli ambienti — preparazione locale, 21 novembre 2026

> **Aggiornamento successivo:** i tre snapshot sono stati infine recuperati
> e verificati contro gli hash dell'utente, senza rifare la raccolta. Risultati
> live e piano staging minimo in `RECOVERY-LIVE-FINDINGS-2026-11-21.md`.
> La sezione seguente conserva il checkpoint precedente al recupero SSH.

## Esito effettivo di questa lavorazione

- Raccolta di schema/ACL/flag **implementata e testata localmente**.
- Confronto runtime/catalogo implementato per il prossimo flusso
  campagna → invito → partecipazione → visibilità giocatore.
- **16 test locali passati**: 4 inventario sorgenti, 11 sicurezza/confronto
  e collector (uno con query reali su PostgreSQL embedded), 1 integrazione
  dell'intera catena SQL/servizi invito su PostgreSQL embedded in memoria.
- **Nessuno snapshot live acquisito**: SSH funziona, ma il tentativo di lettura
  tramite `sudo -n docker exec` è stato negato (`sudo: a password is required`).
  Non è stata richiesta né inserita alcuna password in chat; non sono stati
  cambiati sudoers, ruoli, container o rete per aggirare il blocco.
- Nessuna migration, distribuzione, modifica dell'interfaccia, commit o push.

Il risultato NON è «staging allineato» o «multiplayer verificato». I cataloghi
live e i flag example non vanno confusi. Le informazioni staging ricevute
durante il precedente incidente restano evidenza storica, non nuove letture.

## Componenti

### Inventario locale

`recovery-source-inventory.mjs` descrive migration/riferimenti e flag presenti
nei sorgenti, senza leggere `.env`, export di utenti o dati applicativi.
Non è un ordinatore/installer SQL e non autorizza l'esecuzione delle migration.

### Collector nel container API

`apps/aruba-api/qa/collect-recovery-environment.mjs` riceve l'inventario su
stdin. Deve essere eseguito **nel container previsto** con `staging` o
`production` come argomento. Non fa parte dell'avvio dell'API e non è stato
installato né eseguito sui container live.

Controlli e output:

- Verifica database, ruolo, origine e modalità auth. Staging richiede il ruolo
  dedicato `hollowgate_auth_staging_app`, non il gruppo runtime di produzione.
- Verifica `current_database/current_user` e rifiuta un ruolo superuser,
  CREATEDB, CREATEROLE o BYPASSRLS prima della raccolta cataloghi.
- Apre `BEGIN READ ONLY`, imposta timeout locale, legge **solo cataloghi** e
  conclude con `ROLLBACK` anche se una verifica fallisce.
- Produce presenza/tipo delle tabelle, nomi/tipi delle colonne, grant diretti,
  firme degli overload, grant EXECUTE e attributo SECURITY DEFINER.
- Calcola lato database `md5(pg_get_functiondef(...))`: il testo delle routine
  non viene trasferito. L'hash individua differenze, NON dimostra correttezza
  del codice, equivalenza semantica o integrità crittografica di un bundle.
- Esporta solo flag `AUTH_*_ENABLED` dell'inventario con valori `true`, `false`,
  `null` (unset) o `invalid`. Non stampa percorsi/password di PostgreSQL,
  client ID, secret OAuth, chiavi, token, utenti, conteggi o corpi SQL.
- Il pannello Note compilato resta `unknown`: il container API non può
  dimostrare come sia stato costruito il frontend. Non attivare il pannello
  Note dalla sola capability backend.

Il collector non prova connessioni OAuth, invio mail, browser, gateway,
visibilità dei dati o le policy RLS. Non legge righe applicative, né esegue
le routine applicative che potrebbero avere effetti collaterali.

### Confronto offline

`compare-recovery-environments.mjs` accetta due snapshot validati di ambienti
diversi e produce:

- differenze dei flag, con valori invalidi mai ripetuti nell'output;
- differenze degli hash routine a parità di firma;
- blocker del flusso campagna/invito/giocatore: flag spenti o sconosciuti,
  tabelle/colonne assenti, firma o EXECUTE mancanti, SECURITY DEFINER assente,
  accesso diretto indebito o sconosciuto alle tabelle membership/inviti.

La catena runtime attuale collega `PLAYER_CHARACTERS` ad assegnazioni,
disponibilità, roster e personaggi: il confronto include quelle dipendenze
invece di dichiarare pronta la lista campagne del giocatore con il solo flag
inviti. Lo scopo è **questo flusso**, non tutte le funzioni del sito.

Esiti:

- `blocked`: uno o più prerequisiti mancano (CLI exit 1).
- `catalog-checks-passed-browser-qa-required`: i controlli di catalogo sono
  coerenti, **non** «flusso funzionante» o «deploy autorizzato».
- Snapshot errato/ambiente non riconosciuto: CLI exit 2, errore generico.

L'evidenza della build resta separata e non può essere promossa dallo snapshot.
Il report non elenca automaticamente migration da applicare e non ne esegue.

## Regressione SQL/servizi invito: che cosa è stato davvero provato

`recovery-campaign-player-db.test.mjs` crea PostgreSQL embedded PGlite in
memoria, applica i file sorgente reali in questa sequenza esplicita e ripetibile:

```text
001–005 → 008–012 → 015 → 016 → 026 → 027 → 028 → 029 → 030 → 033
```

Non è una ricetta di aggiornamento di un DB esistente: su uno staging con
alcune migration già presenti, `CREATE TABLE/FUNCTION` può fallire. Occorre
prima confrontare il suo schema effettivo e provare il piano su un clone.

La prova esegue `test_vtt_campaign_invites.sql` e controlla che le sue fixture
siano annullate. Crea poi **soli utenti sintetici in memoria**, assegna a un
login indipendente senza gruppi i soli grant schema/routine necessari e usa
i servizi reali `campaign-service`, `campaign-invite-service` e
`player-character-service` per verificare:

1. Non-owner non può ruotare un invito; niente lettura diretta di membership.
2. Il giocatore senza inviti non vede campagne joined.
3. Creazione, generazione, anteprima e join dell'invito funzionano.
4. Join ripetuto non duplica membership; la campagna privata di un terzo
   utente non compare mai nella lista joined.
5. Rotazione invalida il codice precedente.
6. Dopo revoca membership nei dati della fixture, la campagna non compare
   più al giocatore. **Non si certifica un comando/API/UI di revoca**.

Questa prova **non esegue 037 sul VPS**, non importa dati di produzione,
non prova sessioni HTTP cookie, UI, browser, TURN o più reti. È più forte di
un mock SQL, ma non è un test su PostgreSQL server Aruba.

## Ripetizione locale (operatore, nessun comando richiesto all'utente)

```text
node --test deploy/aruba/qa/recovery-source-inventory.test.mjs deploy/aruba/qa/recovery-environments.test.mjs deploy/aruba/qa/recovery-campaign-player-db.test.mjs
```

Serve la dipendenza dev `@electric-sql/pglite` già presente nel progetto root.
I dati di test sono soltanto in memoria. Il test non apre porte HTTP né usa
Docker/SSH. Le nuove utility non sono collegate all'avvio dell'applicazione.

## Prossimo gate operativo, non ancora eseguito

Acquisire snapshot live con una sessione amministrativa approvata, senza
passwordless Docker generico. Il collector legge il secret DB già montato
solo per aprire la connessione con il ruolo API corrente: il valore non deve
uscire dal container. Il codice può essere eseguito da stdin/eval in un
container read-only (`--recovery-eval`), senza copiare file nel suo rootfs.

Poi: confrontare snapshot → formulare piano specifico → provarlo su **clone
staging con identità QA preservate** → staging con backup/grant e autorizzazione
per il perimetro preciso → prova browser owner/player. Nessuno di questi
passaggi è implicitamente autorizzato dal successo dei 16 test locali.
