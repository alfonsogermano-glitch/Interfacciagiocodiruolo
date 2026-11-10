#!/usr/bin/env bash
set -Eeuo pipefail
root="$(mktemp -d)"
trap 'rm -rf "$root"' EXIT
source_script="$(cd "$(dirname "$0")/../.." && pwd)/scripts/export-isolated-staging-schema.sh"
mkdir -p "$root/work/scripts" "$root/bin" "$root/exports"
cp "$source_script" "$root/work/scripts/export-isolated-staging-schema.sh"
cat > "$root/bin/pg_dump" <<'STUB'
#!/usr/bin/env bash
printf 'pg_dump %s\n' "$*" >> "$CALL_LOG"
out=""
for argument in "$@"; do case "$argument" in --file=*) out="${argument#--file=}" ;; esac; done
[[ -n "$out" ]] || exit 80
printf 'synthetic pg_dump archive' > "$out"
STUB
cat > "$root/bin/pg_restore" <<'STUB'
#!/usr/bin/env bash
printf 'pg_restore %s\n' "$*" >> "$CALL_LOG"
printf 'synthetic toc\n'
STUB
chmod +x "$root/bin/pg_dump" "$root/bin/pg_restore"
export PATH="$root/bin:$PATH" CALL_LOG="$root/calls"
script="$root/work/scripts/export-isolated-staging-schema.sh"
export PGHOST=127.0.0.1 PGPORT=54322 PGDATABASE=hollowgate_synthetic PGUSER=staging_test
assert_reject() {
  : > "$CALL_LOG"
  if ( "$@" ) > "$root/output" 2>&1; then
    echo "FAIL: expected rejection: $*" >&2; exit 1
  fi
  if [[ -s "$CALL_LOG" ]]; then
    echo 'FAIL: executed database tools before rejecting unsafe configuration' >&2
    cat "$CALL_LOG" >&2; exit 1
  fi
}
assert_reject env -u SCHEMA_EXPORT_CONFIRM SCHEMA_EXPORT_DIR="$root/exports/no-confirm" bash "$script"
assert_reject env SCHEMA_EXPORT_CONFIRM=ISOLATED_LOCAL_ONLY PGHOST=db.example.com SCHEMA_EXPORT_DIR="$root/exports/remote" bash "$script"
assert_reject env SCHEMA_EXPORT_CONFIRM=ISOLATED_LOCAL_ONLY DATABASE_URL=postgresql://remote.invalid/x SCHEMA_EXPORT_DIR="$root/exports/url" bash "$script"
assert_reject env SCHEMA_EXPORT_CONFIRM=ISOLATED_LOCAL_ONLY PGDATABASE=postgres SCHEMA_EXPORT_DIR="$root/exports/default" bash "$script"
assert_reject env SCHEMA_EXPORT_CONFIRM=ISOLATED_LOCAL_ONLY PGHOSTADDR=192.0.2.1 SCHEMA_EXPORT_DIR="$root/exports/hostaddr" bash "$script"
assert_reject env SCHEMA_EXPORT_CONFIRM=ISOLATED_LOCAL_ONLY SCHEMA_EXPORT_DIR="$root/work/inside-repo" bash "$script"
mkdir -p "$root/work/hidden"
ln -s "$root/work/hidden" "$root/exports/linked"
assert_reject env SCHEMA_EXPORT_CONFIRM=ISOLATED_LOCAL_ONLY SCHEMA_EXPORT_DIR="$root/exports/linked" bash "$script"
assert_reject env SCHEMA_EXPORT_CONFIRM=ISOLATED_LOCAL_ONLY SCHEMA_EXPORT_DIR="$root/exports/valid" bash "$script" --db-url evil
: > "$CALL_LOG"
env SCHEMA_EXPORT_CONFIRM=ISOLATED_LOCAL_ONLY SCHEMA_EXPORT_DIR="$root/exports/valid" bash "$script" >/dev/null
grep -q '^pg_dump --schema-only --format=custom --no-owner --no-acl' "$CALL_LOG"
grep -q '^pg_restore --list ' "$CALL_LOG"
(cd "$root/exports/valid" && sha256sum --check SHA256SUMS >/dev/null)
test -s "$root/exports/valid/schema.dump"
test -s "$root/exports/valid/schema.toc"
assert_reject env SCHEMA_EXPORT_CONFIRM=ISOLATED_LOCAL_ONLY SCHEMA_EXPORT_DIR="$root/exports/valid" bash "$script"
echo 'PASS: isolated schema exporter denies remote and unsafe paths, creates verified local archive'
