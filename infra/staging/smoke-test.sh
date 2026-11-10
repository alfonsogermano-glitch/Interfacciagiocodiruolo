#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/../.."
compose=(docker compose -f infra/staging/docker-compose.yml)
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
"${compose[@]}" exec -T postgres psql -U hollowgate_test -d hollowgate_test -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS public.backup_fixture(id integer PRIMARY KEY, label text NOT NULL);
INSERT INTO public.backup_fixture VALUES (1, 'hollowgate synthetic fixture') ON CONFLICT (id) DO UPDATE SET label=excluded.label;
SQL
"${compose[@]}" exec -T postgres pg_dump -U hollowgate_test -d hollowgate_test -Fc --no-owner --no-acl > "$work/test.dump"
test -s "$work/test.dump"
sha256sum "$work/test.dump" > "$work/SHA256SUMS"
(cd "$work" && sha256sum -c SHA256SUMS)
"${compose[@]}" exec -T postgres createdb -U hollowgate_test hollowgate_restore
"${compose[@]}" exec -T postgres pg_restore -U hollowgate_test -d hollowgate_restore --no-owner --no-acl < "$work/test.dump"
value="$("${compose[@]}" exec -T postgres psql -U hollowgate_test -d hollowgate_restore -Atqc "SELECT label FROM public.backup_fixture WHERE id=1")"
test "$value" = "hollowgate synthetic fixture"
echo "PASS: synthetic PostgreSQL backup, checksum, restore and row verification"
