# Hollowgate: sviluppo locale e GitHub

> **Aggiornamento 22 novembre 2026:** il metodo corrente è descritto in
> [`TRANSITION-WORKFLOW.md`](TRANSITION-WORKFLOW.md). Il test locale qui sotto
> resta facoltativo; non richiede di ripetere l'accettazione su due siti.

## Avvio del sito completo

Prerequisiti per **ogni** computer: Node.js/npm, Docker Desktop, dipendenze
installate con `npm ci` in `apps/aruba-vtt-pilot` e `apps/aruba-api`, certificati
HTTPS locali in `certs/local/`, chiavi di test in `apps/aruba-api/` e database
PostgreSQL **di test** `hollowgate_auth_test` nel container `hg-notes-real-pg`.
Il database deve essere pubblicato solo su `127.0.0.1:15432` (oppure `:15433`).
Certificati, password, chiavi, dump ed export non vanno mai su GitHub.
Le 70 immagini storiche vengono servite localmente se il pacchetto privato
`deploy/aruba/data/legacy-public-media/` è presente; non viene sincronizzato
da GitHub e non si sostituisce con immagini fittizie quando manca.

Con Docker Desktop attivo:

```powershell
.\start-hollowgate-local.ps1 -CheckOnly
.\start-hollowgate-local.ps1
```

Aprire `https://localhost:5173/` per landing e login;
`https://localhost:5173/vtt/` per il VTT. Il certificato HTTPS locale può
richiedere l'accettazione esplicita nel browser. L'API usa la porta locale 3000
e comunica **solo** con il database di test locale; Vite inoltra `/auth/*` e
`/vtt/*` alla API. L'ambiente di produzione e Cloudflare non cambiano.

Registrazione e recupero password che richiedono email esterne rimangono
disabilitati nell'ambiente locale; così come realtime, TURN e sessioni live.
Non usare account o credenziali di produzione per i test.

La copia locale contiene utenti storici ma **non** le loro password attuali:
prima del login, in PowerShell eseguire `.\create-local-login.ps1` e digitare
privatamente l'email di un utente già presente nella copia e una password
**nuova, soltanto di test**. Lo script aggiorna esclusivamente autenticazione
e sessioni di quell'utente nel database locale; non invia email. Non scrivere
né inviare in chat la password. Se l'utente non esiste localmente, lo script
non cambia nulla. Google e Discord richiedono una futura implementazione OAuth
Aruba e sono disabilitati, non simulati.

## Lavorare su più computer

GitHub sincronizza **il codice**, non il database, gli account di test o le
credenziali. Su ogni PC occorre configurare il proprio ambiente di test;
eventuali dati di prova condivisibili vanno creati come fixture anonime.

Prima di pubblicare le modifiche controllare `git status` e `git diff --cached
--name-only`: nessun file di credenziali, dump, export, dati personali o log
deve entrare nel commit. Eseguire test e build, quindi commit e push solo
quando il proprietario li autorizza. Sull'altro PC usare `git pull` dopo aver
salvato eventuale lavoro locale. **Push su GitHub non significa deploy**:
Aruba viene aggiornata soltanto tramite un rilascio verificato e separato.

Se Docker Desktop non è avviato, lo script si ferma prima di aprire API/VTT.
La sola landing grafica resta consultabile nell'anteprima statica separata.
