# Rilascio Privacy / Elimina dati — 22 novembre 2026

**Archivio V1: primo tentativo annullato con rollback riuscito; pagine non
pubblicate. Causa CDN confermata, seguito in `PUBLIC-LEGAL-RELEASE-V2.md`.**
La riuscita della preparazione/rehearsal non è una pubblicazione.

## Perimetro

- Aggiungere soltanto `privacy.html` ed `elimina-dati.html` nella nuova
  directory `site-pages` del web bind pubblico già esistente.
- Un solo blocco aggiuntivo nel sito `www.hollowgate.quest` del Caddyfile
  condiviso vivo; nessun cambiamento ai byte delle route preesistenti.
- Validare nel container pubblico effettivo e fare reload, non ricreazione.
- Nessun deploy VTT/API, SQL, dump/restore, rotazione OAuth, modifica dei dati,
  del gateway staging isolato o del vecchio codice.
- Non usare i vecchi installer/cutover né sostituire la configurazione viva
  con il Caddyfile auth-trial staging-only presente nel repository.

## Pacchetto e pin

Input privati dell'operatore: `/home/hgadmin/hg-public-legal-20261122`.
Copie root immutabili e backup: `/opt/hollowgate-public-legal-20261122`.
Runner da installare root 0700 una sola volta:
`/opt/hollowgate-release-public-legal-20261122.sh`.

| Oggetto | SHA-256 |
|---|---|
| Manifest input SHA256SUMS | `75bd602e0d5a3bea2b2ca2389d2474861b907791e8dcb2603bfa33433bc531a9` |
| Runner release-public-legal.sh | `562a7425a679c0687b7233ea018f61208f1b11c4b302c5c3f12db1dc26794569` |
| Caddyfile condiviso prima | `05b06f6da2b655f5c3248cbd54fee0cd3f9a2ce06259766502bbce40b757603b` |
| Candidato, solo route legali | `b5ac1260525018dd32044fafc7560fb9406f518dbdb2f1cf897f449f81d99d11` |
| Helper rehearsal non-root | `e6cdc1423db96e837869c1dbcc0bbd3b6babcfe9a8e31c95dde248fe2f847b71` |

`SHA256SUMS` contiene esclusivamente i due HTML, il manifest di build e il
generatore di route. Il runner è pinnato separatamente prima dell'esecuzione.
Non pubblicare questi input come directory generica: copiare soltanto i due
HTML. Se uno dei pin/stati cambia, fermarsi e revisionare, non forzare.

## Guardie e ripristino

Il runner verifica file/inode/stato iniziale, rifiuta una `site-pages` già
esistente e usa copie root con hash verificati. Controlla i bind effettivi
`/etc/caddy/Caddyfile` e `/srv/vtt-pilot` del container pubblico noto, non un
alias Docker ambiguo. Valida il candidato in quel container prima di scrivere
route/pagine e crea un backup fresco del Caddyfile.

La scrittura della configurazione conserva l'inode del bind. Dopo reload:
GET HTTPS delle due pagine con confronto byte per byte, readiness/login/signup/
VTT e readiness staging, hash dell'index VTT e del Caddyfile staging isolato,
identità/immagini/start-time di tutti i container in esecuzione invariati.
Sono controlli tecnici, non una nuova prova completa dei flussi OAuth/login.
Nessuna verifica o scrittura di righe DB viene eseguita da questo rilascio.

Errore/interruzione: ripristino config e reload precedente; la directory
appena creata viene spostata nel work privato, non vengono cancellati media o
file esistenti. Se un altro operatore ha cambiato config/inode/directory, il
runner NON sovrascrive quel lavoro: segnala rollback incompleto e conserva i
file potenzialmente ancora serviti. Non ripetere dopo un errore.

## Evidenze prima dell'applicazione

- Due test HTML/CSS/fedeltà alle sorgenti originali passati; quattro test del
  generatore route passati. Le pagine non richiedono JS, auth o Supabase.
- Diciassette prove di controllo del runner con file temporanei e mock:
  successo, input alterati, target già esistente, bind errato/non leggibile,
  permessi, baseline/preflight, reload, interruzione, HTTPS fallito o contenuto
  sbagliato, derive indipendenti container/staging/Caddy e rollback incompleto.
  I test non-root adattano solo guardia root, ownership e, su Windows, ACL
  nel loro script temporaneo; il runner distribuito non contiene bypass QA.
- Suite Python production complessiva: 26/26 passati. Bash syntax check passa.
- **Caddy Linux 2.10.2 reale**, binario ufficiale scaricato dal VPS come hgadmin,
  archivio confrontato con il checksum SHA-512 ufficiale. Rehearsal su due porte
  effimere `127.0.0.1`, non-root, senza Docker e senza admin endpoint attivi.
  Usato il sito pubblico estratto dalla copia live, con root/API sostituiti da
  fixture private. Validazione prima/dopo, reload, GET/HEAD/hash delle due pagine,
  vecchie route invarianti e reload di rollback realmente eseguiti:

```text
PUBLIC_LEGAL_REAL_CADDY_BASELINE_OK
PUBLIC_LEGAL_REAL_CADDY_RELOAD_AND_HASHES_OK
PUBLIC_LEGAL_REAL_CADDY_ROLLBACK_OK — disposable loopback only; active services untouched
```

Il processo QA è terminato nel `finally`; rimangono soltanto file/log privati
in `/home/hgadmin/hg-public-legal-caddy-qa-20261122/rehearsal`. Nessun container,
file di configurazione attivo o root web pubblico modificato dalla rehearsal.
La validazione del Caddyfile COMPLETO nel gateway vivo resta obbligatoria nel
preflight del runner: la rehearsal non legge le secret del gateway staging.

## Esito atteso dal runner

Richiede sudo interattivo dell'operatore, senza allargare i permessi:
`PUBLIC_LEGAL_PREFLIGHT_AND_BACKUP_OK`, `PUBLIC_LEGAL_CADDY_RELOADED`, infine
`PUBLIC_LEGAL_RELEASE_OK`. In caso contrario acquisire STOP/ERROR/ROLLBACK
senza ripetere il comando o ripristinare dump.

## Esito del primo tentativo: rollback completato, pagine NON pubblicate

L'utente ha eseguito il runner e riportato:

```text
PUBLIC_LEGAL_PREFLIGHT_AND_BACKUP_OK
PUBLIC_LEGAL_CADDY_RELOADED
PUBLIC_LEGAL_STOP: public HTTPS content hash differs
PUBLIC_LEGAL_ROLLBACK_OK — previous routing restored; VTT/API/data untouched
```

Il gate di contenuto HTTPS ha fermato il rilascio dopo il reload. Non ripetere
questo runner: installazione e work privato esistono e conservano l'evidenza.
Il file `privacy.https.html` nel work contiene la risposta osservata; leggerlo
soltanto per diagnosi sanitizzata, senza stampare HTML/script o token CDN.

Controllo HTTPS esterno successivo dell'agente: `/ready` 200, `/login` 200,
`/privacy` 404 e `/elimina-dati` 404; risposte Cloudflare DYNAMIC. Conferma il
ritorno al routing precedente, non il completamento del rilascio.

Trasformazione email/HTML da parte di Cloudflare è un'ipotesi da verificare
sulla risposta salvata, NON una causa già dimostrata. La documentazione
Cloudflare indica che Email Address Obfuscation modifica HTML/introduce lo
script email-decode e non si applica con Cache-Control: no-transform:
https://developers.cloudflare.com/waf/tools/scrape-shield/email-address-obfuscation/
Non disabilitare il confronto esatto né modificare impostazioni globali CDN
prima di identificare la differenza. Nessun nuovo tentativo autorizzato da
un semplice successo di test locali.

### Diagnosi successiva confermata dall'utente

La lettura sanitizzata del file salvato ha riportato 234673 byte originali e
235075 ricevuti, CSS identico, email Cloudflare offuscate e un solo script di
decodifica email; nessun challenge o gzip. Configurazione uguale al backup.
Cloudflare sta quindi modificando almeno i riferimenti email e inserendo lo
script. Non normalizzare via queste differenze per far passare il gate.

La V2 aggiunge `Cache-Control: no-transform` solo alle due risposte legali,
senza disattivare impostazioni globali CDN/WAF. HTML invariato, controllo byte
per byte conservato. Usa nuove directory e un nuovo installer root; questa
V1 e il relativo work/installer sul VPS restano intatti, non vanno rieseguiti.
Il sorgente del runner V1 è conservato nel commit `03ef3695`; il file canonico
nel repository segue adesso la V2. I pin sopra sono quelli storici della V1.
