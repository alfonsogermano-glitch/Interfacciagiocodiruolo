# Staging: RPC sicura per le reazioni e persistenza dei tiri pubblici

Nella PR #47, la proposta `docs/security/proposals/chat_reaction_rpc_staging_only.sql` fornisce una funzione SQL **solo per collaudo**, `chat_toggle_reaction`, che acquisisce la riga con `FOR UPDATE`, verifica `auth.uid()`, appartenenza a una campagna attiva, ricava il nome dal profilo e modifica soltanto la colonna JSONB `reactions`. Il permesso EXECUTE è revocato a PUBLIC/anon e assegnato a `authenticated`. La funzione è `SECURITY DEFINER` con `search_path` vuoto: **non è approvata per la produzione** prima di un audit delle autorizzazioni, owner, GRANT, errori e carico reale.

Il collaudo `infra/staging/reaction-rpc-smoke-test.sh` usa PostgreSQL 17 temporaneo e utenti sintetici per verificare aggiunta, rimozione, persistenza delle reazioni altrui, accesso negato cross-campaign e anonimo, e blocco del normale UPDATE. Non prova simultaneità reale né Supabase/PostgREST.

`DiceSessionContext.tsx` ora salva i tiri pubblici **soltanto dal client dell'autore** dopo l'animazione. I client riceventi mantengono la visualizzazione via Realtime, senza tentare INSERT con `sender_id` altrui. La RLS del database resta la difesa finale.

## Blocchi ancora aperti
- Collegare il client alle RPC **solo quando** lo schema/RPC sono realmente disponibili nello staging Supabase completo. Il client attuale continua a usare il vecchio PATCH per la produzione; non applicare la policy più restrittiva in produzione prima del cutover coordinato.
- Verificare la RPC con utenti Auth reali e POST /rest/v1/rpc, politica RLS delle altre tabelle, POST/DELETE, Realtime, reazioni concorrenti e undo.
- Testare casi di rete nei tiri pubblici (autore offline / reconnect e persistenza dopo animazione).
- Mai copiare il SQL `SECURITY DEFINER` direttamente in produzione senza revisione.

Nessun deploy né migrazione del database remoto eseguiti.
