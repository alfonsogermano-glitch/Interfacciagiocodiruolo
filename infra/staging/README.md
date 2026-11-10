# Staging locale Hollowgate — senza credenziali o dati di produzione

Questo ambiente PostgreSQL serve **solo** a collaudare backup e ripristino con dati sintetici. Non è un'installazione completa di Supabase: non comprende Auth, Realtime, Storage API, Edge Functions o policy Supabase.

## Avvio

Richiede Docker Compose e Bash. Non aprire le porte PostgreSQL verso Internet.

\`\`\`bash
docker compose -f infra/staging/docker-compose.yml up -d --wait
bash infra/staging/smoke-test.sh
docker compose -f infra/staging/docker-compose.yml down -v
\`\`\`

Il test crea un record fittizio, esegue un dump, ripristina su un secondo database locale, confronta il record e verifica un checksum. Non utilizza il progetto Supabase di produzione e non contiene credenziali reali.

## Quando avremo il VPS

- Verificare che lo staging sia isolato da produzione, DNS, utenti, segreti e dati reali.
- Eseguire test Storage su un progetto Supabase **staging** distinto (non presente nell'account alla data della ricognizione).
- Solo dopo, valutare un ambiente Supabase self-hosted completo; PostgreSQL da solo non è equivalente.

## CI: prova reale di Postgres e RLS sintetica

Il job `postgres-restore-smoke` della workflow `staging-preflight.yml` avvia **PostgreSQL 17 effettivo** su GitHub Actions in una rete Docker non esposta, esegue `smoke-test.sh` (dump custom, checksum, restore su secondo database e confronto record), poi `rls-smoke-test.sh` (campagne A/B, GM, giocatore ed estraneo, verifica visibilità e INSERT cross-campaign negato). Termina sempre con `docker compose down -v`.

Esecuzione manuale, **solo su una macchina Docker locale senza dati da conservare**:

```bash
docker compose -f infra/staging/docker-compose.yml up -d --wait
bash infra/staging/smoke-test.sh
STAGING_CONFIRM=LOCAL_ONLY bash infra/staging/rls-smoke-test.sh
docker compose -f infra/staging/docker-compose.yml down -v --remove-orphans
```

**Limiti:** queste policy e tabelle sono esclusivamente sintetiche, non copiano lo schema RLS di Hollowgate. Il test non dimostra il ripristino completo di Supabase (Auth, Storage, Realtime, Edge Functions), né va eseguito su infrastruttura OVHcloud o produzione. Lo script usa nomi fissi ed è pensato per container usa-e-getta.
