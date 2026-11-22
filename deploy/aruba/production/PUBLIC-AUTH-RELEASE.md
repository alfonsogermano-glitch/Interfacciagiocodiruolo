# Fase 2 — preparazione del rilascio unico (NON autorizzato)

Stato al 21 novembre 2026: **non installabile e non eseguibile in produzione**.
La fase 1 è pubblicata e funzionante; `/signup` è 404 e
`/auth/oauth/providers` restituisce `{"providers":[]}`. L'obiettivo è **un
solo comando nella finestra di rilascio**, non un comando che aggiri le prove.

## Componenti preparati, non attivati

- `compose.auth-public.yaml`: abilita signup e OAuth con **file secret e ID
  di produzione**, non con gli ID/secret dello staging; va unito al Compose
  privato, all'overlay delle reti Caddy e all'immagine core verificata.
- `compose.auth-public-off.yaml`: spegne i due flag senza perdere le reti.
- `prepare-public-auth-caddy.py`: genera da una copia del **Caddyfile live**
  un candidato con le sole route `/signup` e `/account/verify-email` nei
  due matcher del sito `www`; rifiuta un layout diverso o una seconda esecuzione.
  Non sostituisce il file montato né riavvia Caddy.
- `preflight-public-auth-schema.mjs`: verifica in sola lettura che il ruolo
  API ristretto trovi le tabelle/funzioni per signup e OAuth, i grant necessari
  e la rate limit `oauth_start`; non stampa utenti o segreti.
- `preflight-public-auth.sh`: gate **read-only** per un bundle root-owned in
  `/opt/hollowgate-auth-bundles/ID`: verifica l'hash del file `SHA256SUMS`,
  i nove file enumerati nel suo manifest, il diff Caddy esatto, i bind mount,
  convalida Caddy da stdin, Compose efficace (senza stamparlo), immagine live,
  secret production-only, schema e stato HTTPS corrente. Non è stato
  installato né eseguito sul VPS. La prima verifica richiederà l'ID e l'hash
  approvati e dovrà restituire `AUTH_PREFLIGHT_OK` prima di poter predisporre
  l'attivazione.
- `release-public-auth.sh`: **candidato non installato** per un solo comando
  dopo il preflight. Salva il Caddyfile e i quattro asset, abilita l'API con
  le reti già dichiarate, aggiorna solo gli asset ammessi, scrive il Caddyfile
  **in-place** (è un bind mount di file), valida e ricarica Caddy senza
  ricrearlo, controlla le route. Un errore tenta il ripristino dei file e la
  ricreazione dell'API con i flag spenti. Non modifica SQL né il VTT.
- `prepare-public-auth-foundation.sh` + `configure-production-oauth.sh`:
  preparazione **separata e non ancora autorizzata** di client produzione in
  prompt nascosti, directory `/opt/hollowgate-production-oauth` sotto parent
  root-owned, e migration 036 su DB live solo dopo backup fresco e restore
  clone verificato. Non ricreano API né abilitano route. Se fallisce dopo
  la creazione dei file, non ripetere automaticamente; l'eventuale schema
  parziale va controllato prima di una ripresa.

Il 21 novembre è stato confermato in sola lettura che Caddy monta
`/opt/hollowgate/aruba-source/deploy/aruba/Caddyfile.auth-trial` come **file
bind** su `/etc/caddy/Caddyfile` e
`/opt/hollowgate/aruba-source/apps/aruba-auth-web` come directory bind su
`/srv/auth-preview`. `caddy validate --config /dev/stdin --adapter caddyfile`
ha dato `CADDY_STDIN_OK` sul Caddyfile live, senza reload. Questi risultati
non provano ancora il candidato generato né un rollback completo.

Aggiornamento: schema 036 e client produzione sono stati preparati con
approvazione esplicita; l'utente ha riportato `AUTH_PRODUCTION_SCHEMA_036_OK`,
`PUBLIC_AUTH_STILL_OFF`, `AUTH_SCHEMA_PREFLIGHT_OK` e `AUTH_PREFLIGHT_OK`.
Il mapping secret email del preflight è stato corretto per i target Compose
normalizzati come `/run/secrets/NOME` (non solo `NOME`).

`test_release_public_auth.py` esegue sei test del flusso shell con file
isolati e Docker/HTTP **simulati**: successo, avvio lento, stop preflight,
errore Compose, errore validazione Caddy e errore HTTP dopo lo switch.
Tutti passano; non sono prove provider/browser né prove Docker complete.
`rehearse-public-auth-gateway.sh` è la prova **reale sul VPS**, da eseguire
prima del rilascio: usa immagini esistenti in due nuovi container con rete
interna, nessuna porta host, secret o DB. Verifica in-place bind inode,
validate/reload Caddy, apertura di signup/verifica e ripristino a 404.
Rimuove i container/rete QA e mantiene solo i file QA per diagnosi. Non
esegue il flusso OAuth reale: quello richiede conferma browser dopo il live.

**Rehearsal gateway reale passata:** l'utente ha riportato
`AUTH_GATEWAY_QA_OK` dalla versione v3: `/ready` e `/login` 200, signup e
verifica email inizialmente 404, poi 200 dopo reload, poi nuovamente 404 al
rollback; container/rete QA rimossi. v1/v2 non hanno toccato il pubblico:
fallivano perché `--cap-drop ALL` impediva l'avvio del binario Caddy
(`operation not permitted`). v3 consente solo `NET_BIND_SERVICE` al Caddy
QA e ferma subito il test se un container termina. Questo collaudo prova
bind-file/reload/ripristino reali, non l'intero flusso OAuth in produzione.

## Gate prima di poter costruire il comando di attivazione

1. Su staging: test **Google e Discord con persone la cui identità social
   non sia già collegata a Hollowgate**, con email nuova; ripetere login,
   uscita, invito/multiutente, diniego e collisione email. Il link a un
   account preesistente deve richiedere login Hollowgate e gesto esplicito;
   email uguale da sola non autorizza un link. Procedura e report senza dati
   sensibili: `STAGING-NEW-SOCIAL-QA.md`. Il 21 novembre l'utente ha
   confermato due nuove identità distinte e login ripetuti. La prova inviti
   multiutente è **non eseguita**: lo staging manca di migration 016; su
   scelta esplicita dell'utente l'attivazione auth viene separata da inviti e
   gameplay multiplayer, che richiedono un rilascio successivo. Questa
   eccezione non vale come test multiutente passato.
2. Creare client Web **nuovi di produzione** con soli callback
   `https://www.hollowgate.quest/auth/oauth/{google,discord}/callback`.
   ID in `/opt/hollowgate-production-oauth/ids.env` (root-owned 0600) e
   segreti separati in `google_client_secret` e `discord_client_secret`
   (UID/GID dell'API non-root, 0600), entro directory dedicata root-owned
   `0700` sotto `/opt`. La directory staging `/opt/hollowgate/config` è
   scrivibile da UID 1001 e non va usata per i nuovi client produzione.
   Mai copiare client o segreti staging. Verificare sul
   provider che callback e impostazioni di pubblicazione siano corretti.
   Nessun valore privato in chat, log, Git o bundle.
3. Confermare servizio email e dominio mittente per produzione: consegna,
   link di verifica su `https://www.hollowgate.quest`, scadenza, rate limit e
   prevenzione abuso. Non abilitare signup se email o controlli anti-abuso
   non sono pronti. Verificare che il secret Resend montato sia di produzione.
4. Eseguire backup integrale PostgreSQL **e restore di prova**. Provare 036
   e grant su clone con ruolo ristretto, poi applicare la migrazione a
   produzione in una finestra **approvata a parte**. Non eseguire 036
   automaticamente durante lo switch: è DDL persistente, non annullabile
   cancellando il container. `preflight-public-auth-schema.mjs` deve passare
   sul DB di produzione prima di aprire i flag.
   **Rehearsal eseguita il 21 novembre:** un backup fresco di `hollowgate`
   è stato ripristinato in `hollowgate_auth_release_verify_20261121` con
   conteggi `63|54|9`; 036, test OAuth transazionale e grant ristretti hanno
   passato sul clone. Nessun SQL live è stato applicato in questo passo.
5. Recuperare il Caddyfile **montato** da Caddy, generare il candidato con
   `prepare-public-auth-caddy.py` e confrontare l'intero diff. Verificare se
   `/etc/caddy/Caddyfile` è montato come file o directory e dimostrare sul VPS
   la convalida del candidato **senza reload**. Il file locale
   `deploy/aruba/Caddyfile.auth-trial` è solo staging: non sovrascrive il
   Caddyfile live. Fare backup esatto del file e dei quattro asset auth-web
   (`index.trial.html`, `app.mjs`, `flow.mjs`, `styles.css`) e verificare che
   la directory host corrisponda a `/srv/auth-preview` nel gateway.
6. Eseguire una rehearsal completa di attivazione **e rollback** su clone e
   gateway isolati: configurazione Compose effettiva senza stamparne i
   secret, endpoint auth, proxy, TLS, pagine, email di prova e identità social
   dedicate. Solo dopo preparare uno script immutabile/root-owned e un
   manifest con hash, preflight `--preflight` e approvazione dell'ID preciso.

Il preflight non può dimostrare da solo che i client creati nelle dashboard
siano distinti, che un utente nuovo abbia completato i flussi o che la
deliverability sia accettabile: questi sono gate manuali documentati, non
variabili da dichiarare `true` in un file. Lo script candidato di attivazione
**non è pronto per l'installazione** finché la prova di validazione Caddy da
stdin e il rollback su gateway isolato non sono stati verificati, oltre ai
gate esterni sopra elencati.

## Semantica prevista del comando unico

Preflight → backup file/immagine → avvio API con entrambe le reti Compose e
client **di produzione** → test Caddy→API e provider disponibili → copia
limitata dei quattro asset auth-web → patch Caddy delle sole due route,
validate/reload senza ricreare il gateway → test pubblici HTTPS e test browser
con account QA autorizzati → risultato breve. Fallimento: ripristino dei
quattro asset, del Caddyfile e dei flag API; verificare `/ready`, `/login`,
`/vtt/` e signup non disponibile. **Non rimuovere tabelle OAuth né account**:
durante la finestra di attivazione potrebbero essere stati creati account o
spedite email; il rollback di visibilità non è un rollback dei dati.

Non riutilizzare i vecchi script `enable-public-auth-root.sh` o
`enable-public-auth-routes-root.sh`: modificano codice/Compose/Caddy senza
questi gate e potrebbero perdere la rete Caddy dichiarata.

Resta aperta anche la diagnostica dei PortBindings su loopback 3004/3005:
misurare la salute via Caddy e HTTPS pubblico, non tramite quelle porte.
Il certificato staging scade il **9 febbraio 2027** e richiede un piano di
rinnovo indipendente.
