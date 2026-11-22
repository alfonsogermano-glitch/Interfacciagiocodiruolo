# Pagine pubbliche originali per Aruba

Render statico dei componenti originali `PrivacyPolicy` e `DeleteData`, con il
CSS globale originale compilato. Non è una seconda implementazione dell'UI.
Non carica auth, Supabase, API o JavaScript nel browser.

Dalla radice, dopo `npm ci`:

```text
npm run test:aruba-public-pages
npm run build:aruba-public-pages
```

Output generato e ignorato da Git:

```text
deploy/aruba/dist/public-pages/privacy.html
deploy/aruba/dist/public-pages/elimina-dati.html
deploy/aruba/dist/public-pages/manifest.json
```

Il manifest riporta hash delle sorgenti originali, CSS compilato e HTML.
Il test di fedeltà confronta corpo JSX e stili inline con hash congelati dal
tag `archive/legacy-pre-aruba-20261122`, non con la candidata stessa.
I default Privacy mantengono il vecchio testo per il sito originale; Aruba
passa i provider e l'infrastruttura attuali senza modificare il layout.

Non eseguire gli installer/cutover storici per pubblicare queste pagine.
`deploy/aruba/qa/prepare-public-legal-routes.py` genera soltanto un candidato
dalla copia del Caddyfile live: validazione nel gateway effettivo, backup,
reload e controllo HTTPS restano parte di un rilascio separato autorizzato.
Il Caddyfile auth-trial nel repository è staging-only, non va caricato sopra
il gateway pubblico condiviso. Nessuna migration DB è richiesta.

Le news non sono incluse: hanno un workflow e dati da recuperare separatamente.
Il piano completo è in `deploy/aruba/qa/RECOVERY-PARITY-PLAN-2026-11-22.md`.
