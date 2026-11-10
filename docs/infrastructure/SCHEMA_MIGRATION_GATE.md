# Hollowgate — Gate schema/RLS prima del ripristino sul nuovo backend

## Situazione verificata (10 novembre 2026)
Questo gate è **di sola lettura**: analizza file SQL presenti nel repository e non importa dati, non crea tabelle e non cambia nessun ambiente Supabase.

- Lo schema `public` del progetto Supabase connesso include 31 tabelle applicative, tutte con RLS abilitato (inventario di sola lettura).
- La storia remota delle migrazioni comprende operazioni precedenti all'archivio locale e versioni non corrispondenti ai nomi dei file locali. Non assumere che i file versionati siano una ricostruzione completa.
- Il repository ha script storici `supabase/20*.sql` **fuori** dalla directory CLI `supabase/migrations/`, oltre a migrazioni incrementali, e non contiene ancora una baseline eseguibile autonoma verificata.
- Alcune vecchie policy usano `USING (true)` o `WITH CHECK (true)` sulla chat: non applicare in uno staging considerato affidabile, né usare semplicemente i file più recenti per rimpiazzare un dump.
- Le cartelle delle due Edge Functions sono presenti, ma il contenuto/versione va confrontato con gli artefatti distribuiti prima di considerarlo equivalente.

## Gate automatizzato
```bash
python3 scripts/audit-staging-migrations.py
python3 tests/infrastructure/test-migration-readiness.py
python3 scripts/audit-staging-migrations.py --require-ready
```
Il primo comando produce inventario e segnalazioni; l'ultimo **deve fallire** fino alla creazione di una baseline completa, sicura e verificata. Un passaggio del controllo statico è solo una condizione necessaria, mai una prova sufficiente di equivalenza DB.

## Sblocco del gate (non eseguito)
1. Acquisire in sola lettura inventario schema, oggetti, ownership, policy, grants, trigger, funzioni ed estensioni senza esportare segreti o dati personali su GitHub.
2. In un ambiente isolato costruire una baseline *da schema*, non un dump di utenti reali. Seguire i comandi CLI correnti verificati tramite `supabase --help`; non collegare o resettare il progetto remoto.
3. Riordinare/riconciliare migrazioni già applicate e SQL storici; evitare doppia applicazione ed effetti collaterali.
4. Testare operazioni con utenti sintetici GM A, giocatore B, estraneo C, inclusi INSERT di tiri tramite peer e aggiornamenti atomici delle reazioni. Le proposte RLS attuali non sono ancora approvate.
5. Testare un restore completo con Auth, Storage byte+policy, Realtime ed Edge Functions, non solo PostgreSQL.
6. Solo dopo i test negativi, i checksum e la review, pianificare il passaggio verso staging OVHcloud.

**NO-GO:** non utilizzare `supabase db push`, `db reset`, `migration up` o SQL storici contro produzione. Nessuna correzione delle policy RLS viene applicata in questa fase.
