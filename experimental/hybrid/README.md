# Hollowgate Hybrid — GM-hosted prototype (non integrato)

Questo proof of concept, basato **solo su Node.js**, verifica che una campagna
possa avere uno stato autorevole sul PC del GM, senza Supabase. I permessi
sono **per campagna**: la stessa identità può essere GM in una partita
e giocatore in un'altra.

## Esecuzione
```bash
node --test experimental/hybrid/host-core.test.mjs
```

La classe `HybridHost` supporta:
- creazione campagne, inviti temporanei e associazioni di giocatori;
- permessi GM e player specifici per campagna;
- movimento token assegnati, note pubbliche/private e dadi lato Host;
- proiezione filtrata degli eventi ai giocatori;
- persistenza atomica dello stato JSON nella directory fornita e recupero locale.

**Limiti critici:** non include ancora HTTP, WebSocket, login verificato,
cache risorse, crittografia dei backup, sincronizzazione offline,
autenticazione di rete né integrazione React. I token di prova sono capacità
effimere: `ownerId` e `userId` in questa API sono solo identità sintetiche,
non identità verificate. La riapertura da file è consentita esclusivamente
al processo locale del GM; **non esporla in un endpoint remoto**.
Non usare questa versione con utenti o contenuti reali.

## Decisione definitiva: salvataggio locale obbligatorio

In **Hollowgate Hybrid** non esiste più una preferenza utente `Locale / Cloud`:
ogni campagna attiva è salvata **esclusivamente sul PC del GM Host**.
I giocatori possono conservare una cache temporanea per grafica e
riconnessione, ma non diventano una seconda fonte autorevole.
Le bozze personali possono restare nel browser dell'utente.

**Hollowgate Hub** non conserva campagne, chat, mappe, token, note o cronologia
dadi: trasporta solo messaggi, inviti e metadati minimi necessari al
collegamento. Niente backup cloud nel nuovo progetto; il backup di sicurezza
sarà locale (esportazione verso un secondo dispositivo/supporto a scelta del
GM). Una sola copia sul disco non è protezione adeguata contro guasti.

Non modifichiamo il toggle di salvataggio del sito attualmente in produzione
finché non esistono un Host utilizzabile e uno strumento sicuro per recuperare
i vecchi dati: eliminarlo **adesso** renderebbe inaccessibili campagne cloud.

Il modulo `storage-policy.mjs` codifica questi invarianti e impedisce
interpretazioni automatiche di `saveMode`. L'importazione di campagne
provenienti da IndexedDB o Supabase è una migrazione esplicita, con backup,
checksum SHA-256, controllo proprietà e conferma, mai una copia silenziosa.

```bash
node --test experimental/hybrid/*.test.mjs
```

## Supabase
Non serve per questi test. **Non** si deve dedurre da questo progetto che
Auth, Storage o Realtime del sistema attuale siano stati migrati o sostituiti.

## Successivi gate
- autentificazione effettiva dell'identità e dell'invito;
- trasporto locale cifrato + Hub/relay e protezione rete/CGNAT;
- sincronizzazione sequenziale e riconnessione, snapshot/resume;
- fog-of-war filtrato lato Host, asset e upload efficienti;
- backup cifrato e migrazione dati locali/cloud senza perdita;
- confronto prestazioni con cloud attuale e carico multi-client.
