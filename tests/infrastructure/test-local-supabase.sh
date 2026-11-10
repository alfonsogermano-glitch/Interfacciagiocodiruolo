#!/usr/bin/env bash
# TDD contract for the local-only Supabase launcher; no Docker/network required.
set -Eeuo pipefail
script_source="$(cd "$(dirname "$0")/../.." && pwd)/infra/staging/local-supabase.sh"
root="$(mktemp -d)"
trap 'rm -rf "$root"' EXIT
mkdir -p "$root/app/infra/staging" "$root/app/supabase" "$root/bin"
cp "$script_source" "$root/app/infra/staging/local-supabase.sh"
printf 'project_id = "hollowgate-local"\n' > "$root/app/supabase/config.toml"
cat > "$root/bin/docker" <<'STUB'
#!/usr/bin/env bash
printf 'docker %s\n' "$*" >> "$CALL_LOG"
[[ "$1" == info ]]
STUB
cat > "$root/bin/npx" <<'STUB'
#!/usr/bin/env bash
printf 'npx %s\n' "$*" >> "$CALL_LOG"
[[ "$1" == --no-install && "$2" == supabase ]]
STUB
chmod +x "$root/bin/docker" "$root/bin/npx"
export PATH="$root/bin:$PATH" CALL_LOG="$root/calls"
script="$root/app/infra/staging/local-supabase.sh"
assert_reject() {
  : > "$CALL_LOG"
  if ( "$@" ) > "$root/out" 2>&1; then
    echo "FAIL: should have rejected: $*" >&2; exit 1
  fi
  if [[ -s "$CALL_LOG" ]]; then
    echo 'FAIL: invoked tools after rejected preflight' >&2; cat "$CALL_LOG" >&2; exit 1
  fi
}
assert_reject env -u STAGING_CONFIRM bash "$script" start
assert_reject env STAGING_CONFIRM=WRONG bash "$script" start
assert_reject env STAGING_CONFIRM=LOCAL_ONLY SUPABASE_ACCESS_TOKEN=test bash "$script" start
assert_reject env STAGING_CONFIRM=LOCAL_ONLY DATABASE_URL=postgres://example.invalid/a bash "$script" start
assert_reject env STAGING_CONFIRM=LOCAL_ONLY VITE_SUPABASE_URL=https://abc.supabase.co bash "$script" start
assert_reject env STAGING_CONFIRM=LOCAL_ONLY bash "$script" start --remote
mkdir -p "$root/app/supabase/.temp"
printf '%s\n' 'remote-id' > "$root/app/supabase/.temp/project-ref"
assert_reject env STAGING_CONFIRM=LOCAL_ONLY bash "$script" start
rm "$root/app/supabase/.temp/project-ref"
printf 'remote_url = "https://abc.supabase.co"\n' > "$root/app/supabase/config.toml"
assert_reject env STAGING_CONFIRM=LOCAL_ONLY bash "$script" start
printf 'project_id = "hollowgate-local"\n' > "$root/app/supabase/config.toml"
# Reject configuration sources that would override reviewed config.toml.
touch "$root/app/supabase/config.json"
assert_reject env STAGING_CONFIRM=LOCAL_ONLY bash "$script" start
rm "$root/app/supabase/config.json"
printf 'SUPABASE_URL=https://evil.supabase.co\n' > "$root/app/.env.local"
assert_reject env STAGING_CONFIRM=LOCAL_ONLY bash "$script" start
rm "$root/app/.env.local"
printf 'SUPABASE_DB_PASSWORD=fake\n' > "$root/app/supabase/.env"
assert_reject env STAGING_CONFIRM=LOCAL_ONLY bash "$script" start
rm "$root/app/supabase/.env"
assert_reject env STAGING_CONFIRM=LOCAL_ONLY SUPABASE_ENV=production bash "$script" start
: > "$CALL_LOG"
env STAGING_CONFIRM=LOCAL_ONLY bash "$script" start > "$root/out" 2>&1
grep -Fxq 'npx --no-install supabase --version' "$CALL_LOG"
grep -Fxq 'npx --no-install supabase start' "$CALL_LOG"
if grep -Fq -- '--yes' "$CALL_LOG"; then echo 'FAIL: unpinned CLI installation' >&2; exit 1; fi
: > "$CALL_LOG"
env STAGING_CONFIRM=LOCAL_ONLY bash "$script" status >/dev/null
grep -Fxq 'npx --no-install supabase status' "$CALL_LOG"
: > "$CALL_LOG"
env STAGING_CONFIRM=LOCAL_ONLY bash "$script" stop >/dev/null
grep -Fxq 'npx --no-install supabase stop' "$CALL_LOG"
echo 'PASS: local Supabase launcher preflight (negative cases, local start/status/stop)'
