# Hollowgate — test SQL reale della proposta RLS chat

Aggiunto un test d'integrazione che esegue **il file esatto** `docs/security/proposals/chat_rls_staging_only.sql` contro PostgreSQL 17 effimero in CI. Le tabelle `campaigns`, `campaign_members` e `chat_messages` riproducono **solo le colonne necessarie** della struttura Hollowgate osservata, non lo schema completo. `auth.uid()` e il ruolo `authenticated` sono simulati in un database di prova.

Il test controlla lettura GM/giocatore, blocco per estranei, inserimenti leciti, falsificazione del mittente, inserimenti tra campagne e UPDATE negato.

**Questo non significa che la proposta sia pronta per la produzione.** Occorrono RLS effettive di `campaigns` e `campaign_members`, verifica Realtime, compatibilità coi tiri pubblicati per conto di altri giocatori, gestione reazioni e cancellazione, nonché test con gli endpoint Supabase reali. Non è stata applicata alcuna policy sul database esistente.

Esecuzione nel job `postgres-restore-smoke` di GitHub Actions; il volume viene eliminato al termine.

## Test incrociati aggiunti
Il fixture attiva ora RLS anche su `campaigns` e `campaign_members`, riproducendo **soltanto** le regole SELECT osservate in produzione. Verifica GM/proprietario, giocatore con iscrizione, estraneo e tentativi di inserimento nella tabella membri. Per la cancellazione riproduce la regola attuale (mittente oppure GM della campagna) e prova cancellazione consentita/negata con `DELETE ... RETURNING`, anche tra campagne. L'assenza di modifiche a `main` e al database remoto resta obbligatoria.

Queste sono prove SQL isolate; non dimostrano che le autorizzazioni delle altre 28 tabelle, i canali Realtime o le chiamate dirette alla Data API funzionino già.
