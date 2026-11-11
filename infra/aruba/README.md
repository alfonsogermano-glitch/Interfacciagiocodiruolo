# Hollowgate · Aruba VPS staging (frontend only)

This is the first deployable unit of the agreed migration away from Vercel/Supabase.
It is **not** the account server, WebRTC signaling, TURN relay or GM data service.

## Architecture and data ownership

- The VPS serves the current React/Vite frontend over HTTP on **loopback only**.
- A future TLS reverse proxy will publish a validated staging hostname on 443.
- The GM computer remains authoritative for campaign content; the hosted service
  must not silently upload campaigns or scene/map assets.
- Real existing accounts must remain intact until a verified identity migration.
- The legacy Supabase-backed login in the current client is **not migrated** here.
  The existing recovery screen still works without Supabase; legacy login does not.
- Do not switch DNS, attach production domains or shut down Vercel/Supabase yet.
- Do not use the staging deployment for real player sessions.

## On a newly provisioned Aruba VPS (Docker Engine + Compose plugin)

Clone the reviewed repository branch into a dedicated staging directory, then:

```sh
docker compose -f infra/aruba/compose.yml config --quiet
docker compose -f infra/aruba/compose.yml up -d --build
curl --fail --silent http://127.0.0.1:8080/healthz
curl --fail --silent http://127.0.0.1:8080/ | head
```

Expected health response: `ok`. The second request should return the built
HTML entrypoint. This confirms **static delivery only**, not application login.

## Gates before going live

1. Validate the frontend build and smoke test using a temporary staging hostname.
2. Implement account/profile migration with verified user identity and password reset
   (never copy credentials from Supabase Auth tables or assume password portability).
3. Build minimal WebSocket signaling + TURN connectivity for PC and Android;
   verify Wi-Fi and 5G sessions with a real GM.
4. Complete local GM save/export/import/recovery workflow; test offline and reconnect.
5. Add TLS/reverse proxy, operational backups, monitoring and abuse protection.
6. Change `hollowgate.quest` DNS only after complete end-to-end testing and rollback plan.

This compose stack does not publish a PostgreSQL port or store player data. It is
intentionally separate from the future account database and signaling services.
