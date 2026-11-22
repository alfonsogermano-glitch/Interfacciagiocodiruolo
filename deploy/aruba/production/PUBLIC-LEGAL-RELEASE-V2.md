# Privacy / Elimina dati — V2, integrità attraverso Cloudflare

Stesso perimetro autorizzato: due HTML originali e route legali nel gateway
pubblico. **Pubblicata con esito positivo e verificata via HTTPS.** Nessun deploy VTT/API,
SQL, OAuth o modifica del gateway staging isolato. V1 non viene cancellata né
rieseguita: backup, risposta HTTPS osservata e installer originali restano.

## Causa e correzione

La diagnosi utente della V1 mostra email offuscate Cloudflare e script
`email-decode.min.js` inserito nel documento, con CSS originale identico.
La V2 aggiunge una sola direttiva al nuovo handle dei due URL legali:

```caddyfile
header Cache-Control "no-transform"
```

Non cambia impostazioni globali Cloudflare, WAF, autenticazione o browser.
Documentazione del comportamento:
https://developers.cloudflare.com/waf/tools/scrape-shield/email-address-obfuscation/

I due HTML e il manifest della build sono copiati **identici byte per byte**
dal pacchetto V1. Nessuna ricostruzione o nuova funzionalità nel VTT.
Il controllo HTTPS resta esatto; non si rimuovono script o trasformazioni
dalla risposta per accettarla. Si richiedono anche header `no-transform` e
Content-Type HTML sulla risposta finale (non su CONNECT/103 intermedi).

## Nuovi percorsi, nessuna sovrascrittura V1

- Upload: `/home/hgadmin/hg-public-legal-20261122-v2`.
- Work/backup root: `/opt/hollowgate-public-legal-20261122-v2`.
- Installer root: `/opt/hollowgate-release-public-legal-20261122-v2.sh`.
- Prova non-root: `/home/hgadmin/hg-public-legal-caddy-qa-20261122/rehearsal-v2`.
- Riutilizzato soltanto il binario Caddy 2.10.2 ufficiale già verificato; non
  la directory di rehearsal V1. Ogni work/installer V2 deve essere nuovo.

| Oggetto | SHA-256 |
|---|---|
| SHA256SUMS input | `2d435370052112ad7cedb09ea38bbdf883bfa7bcff2c525e953f3879e288bcd7` |
| Runner release-public-legal.sh V2 | `a002eb7efb4cc2fd698c935d2db32c9985c03ef90f840c7d32a908a910d50028` |
| Caddyfile prima, ripristinato dalla V1 | `05b06f6da2b655f5c3248cbd54fee0cd3f9a2ce06259766502bbce40b757603b` |
| Candidato con no-transform confinato | `95562a4440785dd1431e94ac8a952bd97f3f5a5b938e73af208aba4127f41fdf` |
| Helper rehearsal V2 | `a93341199f8a44f592d128ae37ffadac91ce0f67c879ccc57128f9d0ca2ad2c8` |

## Verifiche prima del nuovo tentativo

- 22/22 test di controllo del runner passati; suite production totale 31/31.
  Incluse le 17 guardie precedenti e nuove regressioni su header mancante,
  Content-Type errato, script CDN iniettato (deve fallire ancora!), header
  intermedio 103 non sufficiente e direttive case-insensitive.
- 5/5 test del generatore: un blocco aggiunto, byte preesistenti invariati,
  no-transform soltanto dentro le due route. Bash syntax check passato.
- Caddy Linux 2.10.2 reale, senza root, su porte effimere loopback: validazione
  e reload/rollback della copia pubblica con sole fixture locali. GET e HEAD
  restituiscono no-transform e HTML identico; header e contenuti degli altri
  percorsi restano invariati. Prova conclusa e processo temporaneo terminato:

```text
PUBLIC_LEGAL_V2_REAL_CADDY_BASELINE_OK
PUBLIC_LEGAL_V2_REAL_CADDY_RELOAD_HEADERS_AND_HASHES_OK
PUBLIC_LEGAL_V2_REAL_CADDY_ROLLBACK_OK — disposable loopback only; v1 evidence and active services untouched
```

Questa prova non attraversa Cloudflare. La verifica effettiva HTTPS passa
ancora dal gate obbligatorio del runner dopo reload, con rollback in caso di
header assenti, byte diversi o variazioni dei servizi/configurazioni protetti.
Il completamento richiede `PUBLIC_LEGAL_RELEASE_OK` e verifica esterna:
entrambi acquisiti nell'esito sotto. Non equivale a recupero completo del VTT.

Upload V2 e pin verificati sul VPS. Work e installer V1 presenti, target
legale e work/installer V2 assenti; configurazioni vive ancora uguali ai pin
del rollback. Marker dell'ultima verifica agente:
`PUBLIC_LEGAL_V2_BUNDLE_VERIFIED_V1_PRESERVED_NOT_APPLIED`.

## Esito attivo e verifica esterna

L'operatore ha applicato il runner autorizzato tramite sudo e riportato:

```text
PUBLIC_LEGAL_PREFLIGHT_AND_BACKUP_OK
PUBLIC_LEGAL_CADDY_RELOADED
PUBLIC_LEGAL_RELEASE_OK — v2 original pages and no-transform verified over HTTPS; VTT entry/containers/staging config unchanged; no SQL/API/OAuth deployment
```

Verifica successiva dell'agente sul sito pubblico, attraversando Cloudflare:

| URL | Stato | Byte | Script | Cache-Control |
|---|---|---|---|---|
| `/privacy` | 200, text/html | 234673 | 0 | no-transform |
| `/elimina-dati` | 200, text/html | 233361 | 0 | no-transform |

Titoli originali corretti; nessuna offuscazione email o script decode iniettato.
Una seconda lettura HTTPS dal VPS, confrontata con gli input immutabili,
conferma gli stessi SHA-256 per originale e risposta pubblica:

- Privacy: `c3a9d89ebe0695f2dc762cc0653d5f98247b19e1cc1035b8a09c3c27a7f5fe3b`.
- Elimina dati: `b10270341fcaede0f3ff2b684398cd48b96996b4ede67ee37d5a624617cff76c`.

Config condivisa attiva = candidato V2 `95562a44…`; staging isolato ancora
`968b1d40e466df0b5900a3b6894e2df2090616c496fa63e62552d2285f07d3ee`.
`/ready`, `/login` e `/vtt/` rispondono 200. No-transform NON compare sulle
risposte login/VTT (readiness mantiene il suo no-store): header confinato.
Queste GET non costituiscono un nuovo test funzionale di login/OAuth/gioco.
Le invarianti di entry VTT/container sono passate nel runner, secondo l'esito
riportato dall'utente; nessun SQL o deploy API/OAuth è stato eseguito.

Non rieseguire il runner completato. I fix VTT campagne/inviti e il resto
della parità sono ancora attività separate, non pubblicate da questo rilascio.
