#!/usr/bin/env bash
# Hollowgate — isolated local Supabase rehearsal. No remote access or production data.
set -Eeuo pipefail
cd "$(dirname "$0")/../.."

refuse() { printf 'REFUSED: %s\n' "$1" >&2; exit 2; }
[[ "${STAGING_CONFIRM:-}" == LOCAL_ONLY ]] || refuse 'set STAGING_CONFIRM=LOCAL_ONLY'

case "${1:-}" in
  start|status|stop) action="$1" ;;
  *) refuse 'usage: STAGING_CONFIRM=LOCAL_ONLY bash infra/staging/local-supabase.sh {start|status|stop}' ;;
esac
[[ "$#" -eq 1 ]] || refuse 'extra arguments are not permitted'

# The CLI must never be given credentials or a link to a remote Supabase project.
for variable in SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD SUPABASE_PROJECT_ID SUPABASE_PROJECT_REF \
  SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY SUPABASE_SECRET_KEY DATABASE_URL \
  VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY; do
  if [[ -n "${!variable:-}" ]]; then
    refuse "$variable is set; remove remote environment credentials before running"
  fi
done

[[ ! -e supabase/.temp/project-ref && ! -L supabase/.temp/project-ref ]] || refuse 'Supabase remote project link detected'
[[ -f supabase/config.toml && ! -L supabase/config.toml ]] || refuse 'missing or symlinked supabase/config.toml; initialize and review a LOCAL project'
# Refuse obvious remote secrets/URLs in a configuration file too (no secrets printed).
if grep -Eiq '(https?://[^[:space:]"\047]*supabase\.co|postgres(ql)?://|service_role|access_token)' supabase/config.toml; then
  refuse 'config.toml contains a remote endpoint or credential marker'
fi

for tool in docker node npx; do
  command -v "$tool" >/dev/null 2>&1 || refuse "missing required executable: $tool"
done
docker info >/dev/null 2>&1 || refuse 'local Docker daemon unavailable'
# --no-install avoids silently fetching a new, unreviewed CLI release.
npx --no-install supabase --version >/dev/null 2>&1 || refuse 'install and pin Supabase CLI as a local dev dependency first'

case "$action" in
  start)
    npx --no-install supabase start
    printf '%s\n' 'Local Supabase started; synthetic data only. Production untouched.'
    ;;
  status) npx --no-install supabase status ;;
  stop) npx --no-install supabase stop ;;
esac
