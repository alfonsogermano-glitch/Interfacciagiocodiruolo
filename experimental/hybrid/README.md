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

## Taglio dati di test e conservazione degli account reali

**Confermato dal proprietario:** tutte le campagne e i contenuti esistenti
sono di prova e NON richiedono migrazione o conservazione in Hollowgate Hybrid.
Il nuovo Host partirà con un archivio campagne **vuoto**.

**Eccezione vincolante:** gli account esistenti sono reali e vanno preservati,
inclusi identità e accesso. Non cancellare né reimpostare utenti Supabase
Auth, identità, provider, recupero account o sessioni fino alla realizzazione
e verifica di un percorso di autenticazione sostitutivo compatibile.
Gli strumenti GM e giocatore restano accessibili a ogni account; il ruolo
viene verificato per ciascuna campagna.

Non cambiare né rimuovere ancora il selettore Locale/Cloud dal sito in
produzione: la rimozione avverrà con il cutover verso Hybrid, dopo
l'implementazione e il test del login utenti, e non comporterà la
migrazione delle campagne di test. Non cancellare i dati test dal servizio
remoto tramite script automatici: il taglio richiede una fase separata,
backup minimo/ricognizione Auth e approvazione esplicita.

Il modulo `storage-policy.mjs` impedisce che le vecchie preferenze
`saveMode` determinino la persistenza Hybrid. Non include un percorso
di importazione automatica dei vecchi contenuti.

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
- backup locali delle nuove campagne e protezione degli account Auth reali;
- confronto prestazioni con cloud attuale e carico multi-client.
