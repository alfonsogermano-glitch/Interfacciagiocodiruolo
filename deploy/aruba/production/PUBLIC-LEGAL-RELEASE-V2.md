# Privacy / Elimina dati — V2, integrità attraverso Cloudflare

Stesso perimetro autorizzato: due HTML originali e route legali nel gateway
pubblico. **Preparata e provata, non ancora applicata.** Nessun deploy VTT/API,
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
Non rappresentare la V2 come pubblicata prima di `PUBLIC_LEGAL_RELEASE_OK` e
verifica esterna. L'applicazione richiede ancora sudo dell'operatore.

Upload V2 e pin verificati sul VPS. Work e installer V1 presenti, target
legale e work/installer V2 assenti; configurazioni vive ancora uguali ai pin
del rollback. Marker dell'ultima verifica agente:
`PUBLIC_LEGAL_V2_BUNDLE_VERIFIED_V1_PRESERVED_NOT_APPLIED`.
