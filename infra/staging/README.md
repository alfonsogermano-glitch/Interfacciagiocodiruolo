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
