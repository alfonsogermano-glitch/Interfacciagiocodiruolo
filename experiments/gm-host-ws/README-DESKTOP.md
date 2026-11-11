# Hollowgate GM Host — Desktop Windows (sperimentale)

L'applicazione finale proposta è un installer Windows con un'icona e **un solo avvio** per il GM. Il server WebSocket è incluso nell'app Electron; cloudflared è integrato nel pacchetto e viene avviato senza console. Gli utenti giocatori non installano software: usano un URL HTTPS nel browser.

## Esperienza GM

1. Installare l'eseguibile NSIS prodotto da GitHub Actions (non il file ZIP dei sorgenti).
2. Aprire **Hollowgate GM Host** dall'icona desktop.
3. Il server locale parte automaticamente. La sessione viene archiviata in AppData dell'utente Windows.
4. Cloudflare Quick Tunnel viene avviato in background e l'URL viene inserito nel campo GM in automatico. L'invito viene preparato quando la stanza è pronta.
5. Premere **Copia link** e inviarlo ai giocatori. Alla chiusura dell'app termina anche la connessione esterna.

Non si aprono PowerShell, CMD o altri terminali. Node.js ed Electron sono integrati nell'eseguibile distribuito. Non sono richieste aperture porte sul router.

## Build per sviluppatori

Con Node 22+ su Windows nella cartella \`experiments/gm-host-ws\`:

\`\`\`powershell
npm install
npm test
powershell -ExecutionPolicy Bypass -File scripts/fetch-cloudflared.ps1
npm run build:win
\`\`\`

La pipeline \`.github/workflows/hybrid-gm-host-ws.yml\` esegue i test, scarica e verifica l'hash ufficiale SHA256 di cloudflared e crea l'installer NSIS x64 come artifact GitHub Actions. L'installer non è firmato; Windows SmartScreen può mostrare un avviso.

## Vincoli ancora aperti

- **NON destinato alla produzione.** Cloudflare Quick Tunnel è instabile e l'URL cambia; servirà un tunnel nominato, affidabile e una gestione robusta dei permessi.
- Il codice è un laboratorio e NON è ancora integrato con il vero VTT React, le campagne, la libreria mappe o l'autenticazione Hollowgate.
- Lo stato persistente è solo dimostrativo; non caricare dati veri.
- Prima del rilascio: verifiche su Windows reale, aggiornamenti firmati, cancellazione e revoca inviti, backup e ripristino campagne, gestione guasti tunnel, test multiutente.
