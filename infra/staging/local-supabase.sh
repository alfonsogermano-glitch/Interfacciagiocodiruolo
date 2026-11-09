#!/usr/bin/env bash
# Hollowgate local Supabase staging. Never links to or resets a remote project.
set -Eeuo pipefail
cd "$(dirname "$0")/../.."
if [[ "${STAGING_CONFIRM:-}" != "LOCAL_ONLY" ]]; then
  echo "REFUSED: set STAGING_CONFIRM=LOCAL_ONLY to use isolated local Supabase" >&2
  exit 2
fi
for tool in docker node npx; do
  command -v "$tool" >/dev/null || { echo "Missing $tool" >&2; exit 2; }
done
docker info >/dev/null
if [[ -f supabase/.temp/project-ref ]]; then
  echo "REFUSED: Supabase CLI local project link detected; unlink in a separate reviewed operation." >&2
  exit 2
fi
if [[ -n "${SUPABASE_ACCESS_TOKEN:-}" || -n "${SUPABASE_DB_PASSWORD:-}" ]]; then
  echo "REFUSED: remote Supabase credentials must not be present during local rehearsal." >&2
  exit 2
fi
if [[ ! -f supabase/config.toml ]]; then
  echo "Missing supabase/config.toml: run 'npx supabase init' locally first, then review generated configuration." >&2
  exit 2
fi
case "${1:-}" in
  start)
    npx --yes supabase start
    echo "Local Supabase started. Do not use production credentials or production data."
    ;;
  status)
    npx --yes supabase status
    ;;
  stop)
    npx --yes supabase stop
    ;;
  *)
    echo "Usage: STAGING_CONFIRM=LOCAL_ONLY bash infra/staging/local-supabase.sh {start|status|stop}" >&2
    exit 2
    ;;
esac
