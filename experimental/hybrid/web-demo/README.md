# Browser proof of concept — WebRTC Hybrid

A new standalone, static browser interface for the GM and up to multiple players.
The GM opens the page, starts a synthetic campaign and shares manually
the WebRTC answer; players create an offer and paste the answer. The
encrypted data channel carries rolls, notes and token movement. This
does **not** use Supabase, actual Hollowgate credentials, production databases,
external cloud storage or persisted Hub state.

## Test procedure
1. Open **two browsers**, ideally on two different machines.
2. GM clicks «Sono il GM» → «Avvia / riprendi».
3. Player clicks «Sono un giocatore» → «Genera richiesta».
4. Player copies the offer to GM; GM pastes it and generates an answer.
5. GM copies the answer to player; player pastes it and clicks «Completa».
6. Test roll d20, movement and public notes. GM private notes must not
   be sent in the player's snapshot.
7. GM refreshes; local browser save should remain, but players need
   to reconnect because sessions are ephemeral.

No TURN server exists; NAT/firewalls can prevent connections across
some networks. Manual offer/answer is only temporary signaling until
Hollowgate Hub is ready. The GM's browser must remain open, and browser
storage can be cleared: this is not a production-ready file-backed host.
Identity is a synthetic, per-connection temporary ID; any person with the
manually exchanged offer can become a player. Use only test data.

## Important distinction
This demo is a functional direct peer connection **not** the Node.js GM Host
or the future centralized Hub. A separate Vercel preview can host the
static UI, without merging or redeploying the main Hollowgate application.

Run static contract checks with
`node --test experimental/hybrid/web-demo/demo.test.mjs`.

## Preview pubblica mediante GitHub Pages

La pubblicazione automatica su Vercel è stata rifiutata (403: nessun
permesso di creare progetti). Anche `configure-pages` GitHub Actions è
stato respinto (Pages non abilitato; integrazione senza permessi admin).
Per evitare modifiche alla produzione è stato preparato un ramo
**`gh-pages`**, contenente solo `index.html`, `demo.js`, `styles.css`.

**Unica azione del proprietario del repository:** aprire
`https://github.com/alfonsogermano-glitch/Interfacciagiocodiruolo/settings/pages`,
selezionare «Deploy from a branch», scegliere `gh-pages` e `/(root)`,
poi «Save». Il link *atteso*, da verificare dopo l'attivazione, è
`https://alfonsogermano-glitch.github.io/Interfacciagiocodiruolo/`.
Non assegnare domini della produzione.

Il sito demo **non è** ancora integrato nel vero client React Hollowgate
né nell'Host Node.js, e lo scambio WebRTC è manuale e senza identità reali.

## Hollowgate Connect con codice stanza (in preparazione)

La schermata ora comprende un pannello opzionale con creazione e inserimento
di un codice stanza. Il pannello resta **disabilitato** quando manca un endpoint
HTTPS del servizio; non è una funzione già disponibile sulla preview pubblica.
Quando sarà presente il servizio autenticato, il client `connect-client.mjs`
invierà solo l'offerta/risposta WebRTC al destinatario della stanza, mentre
la sessione di gioco continuerà a transitare direttamente in WebRTC.
Lo scambio manuale rimane il percorso di test funzionante.

**Non pubblicare l'attuale server di segnalazione su Internet:** al momento
usa identità sintetiche, stanza condivisa non autenticata e non prevede
rate limiting, TLS, controlli di abuso o protezioni di origine. Il suo
listener è limitato a localhost. Non puntare il pannello a Supabase o
al sito di produzione.

## Collegamento rapido dimostrativo (PeerJS Cloud)

È disponibile una modalità opzionale di prova **senza endpoint personalizzato**:
il GM preme «Crea stanza demo come GM», invia il codice casuale di
12 caratteri, e il giocatore preme «Partecipa come giocatore».
Il broker pubblico PeerJS `0.peerjs.com` gestisce la segnalazione
WebRTC (offerte, risposte, IP, metadati), mentre lo stato della
campagna e i comandi restano sui canali WebRTC tra browser. Non si
usa l'autenticazione degli utenti di Hollowgate. **Non inserire
contenuti reali**. Disponibilità e limiti sono stabiliti dal provider
terzo. TURN può essere necessario su altre reti.

Questa prova **non equivale** al rilascio del server Hollowgate Connect
proprietario: il codice `signaling-hub.mjs` resta locale/non
pubblicabile finché non abbiamo infrastruttura HTTPS e autentificazione.
Per la versione reale serviranno anche un sistema di accessi per
campagna, sicurezza e protezioni contro gli abusi.

## Riconnessione sperimentale
Sul collegamento PeerJS del giocatore, la chiusura del canale provoca fino
a 6 tentativi, con intervalli crescenti (1, 2, 4, 8, 10, 10 secondi).
Premendo «Disconnetti», i tentativi vengono annullati. Ogni tentativo
apre un nuovo canale e deve essere **nuovamente autorizzato dal GM**;
non si trasferiscono diritti d'accesso automaticamente. Il codice
GM viene ricordato in `sessionStorage` per consentire la riapertura
della pagina nella stessa scheda, se il suo identificatore PeerJS è
ancora disponibile. Il contenuto demo del GM resta nel `localStorage`.
Limiti: connessioni manuali non sono riconnesse, un riavvio del PC
non garantisce il riuso del codice e la scadenza dei tentativi richiede
un intervento dell'utente.
