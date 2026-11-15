# Hollowgate Aruba — first backend increment

This is an isolated staging service, **not** the production Hollowgate API.

- `GET /health` returns service liveness without querying the database.
- `GET /ready` performs a `SELECT 1` against PostgreSQL and returns HTTP 503 when unavailable.
- The database password comes from the existing VPS file `/opt/hollowgate/config/postgres_password` via a Compose secret.
- PostgreSQL remains on the private Docker network `hollowgate-db`.
- The API binds to `127.0.0.1:3002` only.
- No login, account, campaign, or GM-host functionality is implemented yet.
- Do not edit DNS, Supabase, Vercel, or the existing Compose project to test this service.

To validate the source: `cd apps/aruba-api && node --test` (Node 24 or newer).

After review, on the VPS, check out this branch into a **separate directory** (not `/opt/hollowgate/compose`) and run `sudo docker compose -f deploy/aruba/compose.api.yaml up -d --build`. Verify `curl -i http://127.0.0.1:3002/health` and `curl -i http://127.0.0.1:3002/ready`. PostgreSQL must already be healthy on the external network. Do not deploy until tests and access have been checked.

Authentication and authorization must be designed and tested before any real data endpoints are added. Backups must be proven restorable before importing live users.
