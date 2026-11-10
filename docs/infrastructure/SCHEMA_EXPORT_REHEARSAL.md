# Hollowgate — esportazione di prova dello schema e ripristino self-hosted

## Scopo di questo intervento
Lo script `scripts/export-isolated-staging-schema.sh` produce un archivio **schema-only** PostgreSQL per uno **staging già esistente su localhost**, privo di dati reali. Richiede `SCHEMA_EXPORT_CONFIRM=ISOLATED_LOCAL_ONLY`, host loopback, database di prova con nome esplicito, directory nuova fuori dal repository e strumenti PostgreSQL locali. Salva un file custom, un indice `pg_restore --list` e checksum SHA-256.

Non serve per estrarre il progetto Supabase gestito attuale e **non** effettua alcun ripristino. `--no-owner --no-acl` esclude i grants/owners, quindi non è sufficiente per ripristinare i permessi.

### Esempio, solo su PostgreSQL locale con dati sintetici
```bash
export SCHEMA_EXPORT_CONFIRM=ISOLATED_LOCAL_ONLY
export PGHOST=127.0.0.1
export PGPORT=54322
export PGDATABASE=hollowgate_synthetic
export PGUSER=staging_test
export SCHEMA_EXPORT_DIR=/tmp/hollowgate-schema-rehearsal
# Autenticazione tramite PGPASSFILE protetto o autenticazione locale.
bash scripts/export-isolated-staging-schema.sh
```
Il percorso di output deve essere nuovo e il genitore deve esistere; non scegliere directory dentro GitHub.

### Per la migrazione vera Supabase Platform → OVHcloud
La documentazione ufficiale [Restore a Platform Project to Self-Hosted](https://supabase.com/docs/guides/self-hosting/restore-from-platform) indica **tre esportazioni distinte** con Supabase CLI: ruoli, schema e dati. Quella procedura applica filtri per i sistemi Supabase e non equivale a un comune `pg_dump`. Va verificata con CLI fissata e ambiente dedicato, destinazione protetta e approvazione prima del trasferimento di dati reali.

- Conservare ruoli e schema completi, RLS e funzioni senza pubblicare definizioni sensibili su GitHub.
- Eseguire prima test su un'istanza Supabase self-hosted isolata, con PostgreSQL compatibile.
- Trasferire separatamente **i byte dei bucket Storage** e entrambe le Edge Functions (`make-server-771c5bfd`, `dice-secret-roll`).
- Riconfigurare in modo sicuro Auth, SMTP, JWT, Realtime, Gemini e Resend; i token attuali potrebbero richiedere nuovo login.
- Verificare permessi cross-campaign, accessi GM/giocatore, token segreti, tiri, mappe e backup ripristinato; nessun cutover DNS prima del GO.

### Verifiche automatiche
```bash
bash -n scripts/export-isolated-staging-schema.sh tests/infrastructure/test-schema-export.sh
bash tests/infrastructure/test-schema-export.sh
```
Questi test usano `pg_dump` e `pg_restore` simulati e non contattano alcun database. Non dimostrano ancora la possibilità di ripristinare la produzione.

**Stato: preparazione**, nessun export reale e nessun restore effettuato.
