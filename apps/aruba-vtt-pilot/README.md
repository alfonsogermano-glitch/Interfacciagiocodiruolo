# Hollowgate Aruba VTT — isolated React lobby

This is NOT the existing Supabase-backed VTT. It is a standalone React entry
that uses only the verified Aruba cookie via GET /vtt/bootstrap. There is no
Supabase import, no campaign data, and no browser-stored authentication token.

After a successful login in the protected staging /login page, the new
"Entra nel portale VTT Aruba" link opens /vtt/. The lobby displays the
verified identity and an explicit, disabled campaign area. GM and player
functions remain unavailable until a separate Aruba campaign backend has
server-side ownership/member checks. Logout revokes the Aruba session.
Unverified/expired sessions fail closed and never reach a game dashboard.

Build only this isolated app using:
  bash deploy/aruba/scripts/build-vtt-pilot.sh
The script runs npm in node:24-alpine scoped to apps/aruba-vtt-pilot (without modifying a lockfile) and
outputs deploy/aruba/dist/vtt-pilot, ignored by Git. It does not build the
main Vercel app. The existing private trial overlay mounts that output read-only.

Deployment after validation:
  git pull --ff-only origin feature/aruba-api-foundation
  bash deploy/aruba/scripts/build-vtt-pilot.sh
  sudo docker compose -p hollowgate-auth-staging -f deploy/aruba/compose.auth-staging.yaml -f deploy/aruba/compose.auth-trial.yaml up -d --no-deps --build aruba-auth-staging
  sudo docker compose -f deploy/aruba/compose.edge-staging.yaml -f deploy/aruba/compose.edge-auth-trial.yaml up -d --no-deps --force-recreate caddy

This remains on staging.hollowgate.quest behind Basic Auth; there is no
automatic migration of Supabase users, characters, campaigns, or sessions.
