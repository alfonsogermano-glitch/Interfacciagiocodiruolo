# Hollowgate Connect — esecuzione isolata

Il motore proprietario di segnalazione (`signaling-hub.mjs`) supporta le
offerte e risposte WebRTC, token temporanei e stanze in memoria. È separato
dal WebRTC, che trasferisce i dati del gioco direttamente fra i browser.

## Prova locale da sviluppatore

```bash
node experimental/hybrid/connect-server.mjs
```

L'istanza usa soltanto `127.0.0.1:8787`, non viene esposta su Internet.
`CONNECT_PORT` può cambiare la porta; `CONNECT_ALLOWED_ORIGIN` permette
di indicare **una** origine browser HTTPS autorizzata (default la demo
GitHub Pages). NON utilizzare dati o account reali. In produzione un
proxy TLS dovrà applicare l'origine effettiva, limiti di rete e accesso.

```bash
node --test experimental/hybrid/*.test.mjs experimental/hybrid/web-demo/*.test.mjs
```

## Gate obbligatori prima della pubblicazione

- ospitare un servizio HTTPS dedicato (la demo GitHub Pages è statica);
- autenticare account Hollowgate esistenti senza cancellarli e applicare
  autorizzazioni GM per ciascuna campagna;
- autorizzare esplicitamente l'ingresso dei giocatori invece di usare
  soltanto il codice stanza;
- TLS, limiti sul gateway, controllo richieste, log tecnici senza segreti,
  protezione da abuso e audit di sicurezza;
- considerare la resilienza del signaling, le riconnessioni e TURN.

Il servizio **non** va avviato pubblicamente nella forma attuale.
Vercel attualmente restituisce 403 per la creazione di un progetto
separato nell'organizzazione collegata. Non è stato quindi attivato
un indirizzo HTTPS proprietario.

Il canale PeerJS usato nella demo precedente rimane il fallback
sperimentale, e non fa parte del backend proprietario.

## Gate GM approvazione (implementato solo nel prototipo dedicato)

L'endpoint `/v1/join` crea esclusivamente una richiesta `pending`.
Il GM consulta `/v1/pending` e sceglie `/v1/decision`, con
approvazione o rifiuto esplicito. Fino a decisione positiva,
`/v1/send` e `/v1/poll` restituiscono 403. Il giocatore controlla
`/v1/status` e il client web attende l'autorizzazione prima di
creare e inviare l'offerta WebRTC.

**Attenzione:** il nome visualizzato del richiedente è dichiarato
dal browser e non rappresenta un'identità autenticata. Il futuro
server pubblico richiede ancora verifica dell'account esistente,
autenticazione del GM, autorizzazioni per campagna e sicurezza di rete.
Questa UI è accessibile solo nel pannello avanzato dedicato,
non modifica il percorso demo PeerJS.
