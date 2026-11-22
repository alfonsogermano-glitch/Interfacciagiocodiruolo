# Rilasci core successivi (API + VTT, senza SQL)

Questo è un modello per **futuri** rilasci core. La fase 1 del 20–21 novembre
2026 è già pubblicata: **non** rieseguire il suo bundle o il vecchio comando
`compose up`. Nessun file in questa directory autorizza un deploy.

## Prima della finestra di rilascio (lavoro dell'operatore)

1. Eseguire test API e VTT/build localmente; creare l'immagine nuova, provare
   login e VTT su un database clonato e verificare il percorso Caddy → API
   candidata su rete condivisa, con alias QA diverso da quello pubblico.
   Eliminare il container QA dopo la prova. Mai usare il database live per QA.
2. Fare backup PostgreSQL nuovo **e prova di restore**; controllare che sia
   utilizzabile prima di chiedere approvazione. Questo script non esegue SQL.
3. Predisporre un ID univoco (`2026-11-21-core-02`, per esempio) e un bundle
   root-owned, non scrivibile da utenti non root, in
   `/opt/hollowgate-core-bundles/ID/` con soli:
   `compose.core-release.yaml`, `compose.core-rollback.yaml`,
   `vtt/index.html`, `vtt/assets/index-HASH.js`.
   Anche le directory `/opt/hollowgate-core-bundles`, `ID`, `vtt`, `assets`
   devono essere root-owned e non scrivibili da utenti non root. Creare
   `/opt/hollowgate-core-rollback` root-owned e non scrivibile da altri.
   Il release overlay deve dichiarare **entrambe** le reti, l'alias pubblico
   `hollowgate-production-api`, l'immagine esatta, `AUTH_SIGNUP_ENABLED=false`
   e `AUTH_OAUTH_ENABLED=false`. Il rollback overlay deve usare un tag nuovo
   `hollowgate-api-core-rollback:ID` e dichiarare le stesse reti e alias.
   Non copiare interi alberi web, media, `.env` o segreti nel bundle.
4. Mettere un JSON root-owned in `/opt/hollowgate-core-manifests/ID.json` con
   **esattamente** queste chiavi, tutte stringhe (valori dimostrativi, NON
   utilizzabili per il deploy):

   ```json
   {
     "id": "2026-11-21-core-02",
     "image": "hollowgate-api-core-candidate:20261121",
     "image_id": "sha256:<64-caratteri-esadecimali>",
     "rollback_image": "hollowgate-api-core-rollback:2026-11-21-core-02",
     "release_compose_sha256": "<SHA-256-del-release-overlay>",
     "rollback_compose_sha256": "<SHA-256-del-rollback-overlay>",
     "vtt_index_sha256": "<SHA-256-index.html>",
     "vtt_asset": "index-NUOVOHASH.js",
     "vtt_asset_sha256": "<SHA-256-del-JS>"
   }
   ```

   Verificare l'ID immagine con `docker image inspect`, non con il solo tag.
   Anche `/opt/hollowgate-core-manifests` deve essere root-owned e non
   scrivibile da utenti non root.
   Calcolare e registrare **fuori dalla chat** l'hash del manifest. Installare
   `release-core.sh` una volta sola in `/usr/local/sbin/hollowgate-core-release`
   come file root-owned `0755` dopo revisione e verifica dell'hash. Non dare
   permessi sudo passwordless generici a Docker o Compose.
5. Eseguire in anticipo `--preflight` (sola lettura):

   ```bash
   sudo /usr/local/sbin/hollowgate-core-release \
     /opt/hollowgate-core-manifests/ID.json SHA256_MANIFEST ID --preflight
   ```

   Richiedere **nuova autorizzazione esplicita** per quell'ID, hash e perimetro.
   Se cambiano bundle o manifest, ripetere prove/preflight e approvazione.

## Nella finestra approvata: un solo comando

```bash
sudo /usr/local/sbin/hollowgate-core-release \
  /opt/hollowgate-core-manifests/ID.json SHA256_MANIFEST ID
```

Il comando non stampa configurazioni private: verifica manifest e file,
Compose efficace, vecchia e nuova immagine, nome del database runtime,
rete/alias, sito pubblico e
signup/OAuth spenti. Crea un backup separato dell'indice e tagga l'immagine
precedente, aggiorna API, verifica Caddy e WWW, copia il JS e poi cambia
`index.html` con rename nello stesso filesystem. In caso di fallimento dopo
l'inizio delle modifiche tenta il rollback **di indice e API** tramite Compose
con rete dichiarata. Il JS con hash nuovo eventualmente rimasto è innocuo.

Atteso: `RELEASE_OK: ID ...` oppure `ROLLBACK_OK ...`. Se compare
`ROLLBACK_INCOMPLETE`, intervenire immediatamente, non ripetere il comando.
Ogni ID è monouso: il backup già esistente o l'asset già presente bloccano
una seconda esecuzione. Le porte host 3004/3005 non sono prova di salute:
Docker mostrava PortBindings ma il loopback non rispondeva; lo script prova
direttamente Caddy → API e l'origine HTTPS pubblica. Diagnosticare il loopback
separatamente, senza modificarne la firewall durante un deploy.

**Il backup PostgreSQL e il suo restore di prova sono un gate manuale**:
questo script non li crea e non può provarne la recuperabilità durante il
deploy. Non dichiarare la procedura pronta finché il relativo verbale non è
stato controllato dall'operatore prima di richiedere approvazione.

## Fase 2: NON coperta da questo comando

Registrazione email e Google/Discord richiedono prima: client **produzione**
separati da staging, migrazione OAuth 036 e grant verificati con backup/restore,
configurazione sicura dei segreti, prova staging di utente social genuinamente
nuovo e flussi con più persone, link solo esplicito (mai per semplice email),
verifica email e routing Caddy pubblico, piano di rollback dei flag e delle
pagine. Preparare un piano/script specifico e una **nuova** autorizzazione;
non estendere `release-core.sh` con `AUTH_OAUTH_ENABLED=true` o signup.
Pianificare anche il rinnovo TLS staging prima del 9 febbraio 2027.
