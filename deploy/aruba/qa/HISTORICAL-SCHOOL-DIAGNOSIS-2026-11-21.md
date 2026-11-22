# Campagna storica: La scuola degli Orrori

## Evidenza acquisita

Output della diagnosi read-only eseguita dall'utente, dopo fix routing staging
isolato. L'utente ha confermato creazione/invito/adesione/refresh staging OK;
questo non certifica recupero storico o multiplayer realtime.

- Produzione `hollowgate`: 54 campagne totali.
- Campagna cercata presente: riferimento anonimizzato `7d67eef36bb9`.
- Proprietario `2b8c2bdf5dd7`: active, email verificata.
- `list_owned_campaigns(owner_id)` restituisce la campagna.
- 6 character_drafts, 5 documenti narrativa kind monsters, 3 kind npcs.
- Ledger: 339 record totali, una campagna sorgente corrispondente e relativo
  target operativo presente. Non è una nuova verifica completa di tutti i
  payload o dei media.
- Staging `hollowgate_auth_test`: 4 campagne totali, nessuna corrispondente,
  ledger storico non installato. Non copiare produzione sopra staging.

## Limiti e prossimo controllo

I risultati escludono l'assenza della campagna storica selezionata nel DB di
produzione, ma non dimostrano che il browser dell'utente sia autenticato con
il proprietario storico, né che l'API runtime/bundle pubblichino i contenuti.
Immagini e altri contenuti non sono verificati dalla query.

La scheda VTT nel browser integrato OpenCode ha risposto HTTP 401 a una GET
di `/vtt/bootstrap`: non condivide la sessione dei browser esterni dell'utente.
Non sono stati letti cookie/token, né modificate identità o autorizzazioni.
Serve accesso effettuato dall'utente in quella scheda per confrontare API,
identità e UI senza altri comandi sudo. Nessun deploy autorizzato per questa
diagnosi. Il prossimo confronto deve evitare di stampare email o token.
