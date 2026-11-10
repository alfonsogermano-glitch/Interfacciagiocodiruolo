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

## Salvataggi attuali da conservare
La modalità `local` attuale del VTT è **IndexedDB del singolo browser**:
non equivale a un host multiplayer. `cloud` attualmente usa Supabase.
L'architettura proposta distingue invece:

1. **Locale personale** — IndexedDB per bozze e contenuti privati.
2. **Campagna ospitata** — il GM Host è fonte autorevole e salva su disco.
3. **Backup cloud opzionale** — una copia cifrata, non una seconda fonte di
   verità modificabile durante la partita.

La migrazione dei vecchi dati richiede un wizard di export/import esplicito,
con anteprima, checksum, backup e conferma prima del cambio di autorità:
mai passare semplicemente da 'cloud' a 'local' reinterpretando i dati.

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
