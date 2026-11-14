#!/usr/bin/env bash
# Local-only E2E smoke test. Creates and deletes one disposable test account.
set -Eeuo pipefail
umask 077
db="${HG_POSTGRES_CONTAINER:-hollowgate-postgres-1}"
api="${HG_AUTH_API_CONTAINER:-hollowgate-auth-staging-aruba-auth-staging-1}"
url="${HG_AUTH_TEST_URL:-http://127.0.0.1:3003}"
origin="https://staging.hollowgate.quest"
db_name="hollowgate_auth_test"
id=""
tmp="$(mktemp -d)"
cleanup(){
  local code=$?
  trap - EXIT
  if [[ -n "$id" ]]; then
    if ! printf "DELETE FROM hollowgate_auth.users WHERE id=:'uid'::uuid;\n" |
      sudo docker exec -i "$db" psql -X -q -U hollowgate -d "$db_name" \
      -v ON_ERROR_STOP=1 -v "uid=$id" >/dev/null; then
      echo "WARNING: test account cleanup failed for ID $id" >&2
      code=1
    fi
  fi
  rm -rf -- "$tmp"
  exit "$code"
}
trap cleanup EXIT

[[ "$url" =~ ^http://127[.]0[.]0[.]1:[0-9]+$ ]] || { echo "Loopback URL required" >&2; exit 1; }
[[ "$db" =~ ^[a-zA-Z0-9_.-]+$ && "$api" =~ ^[a-zA-Z0-9_.-]+$ ]] || exit 1
id="$(cat /proc/sys/kernel/random/uuid)"
email="e2e-$id@example.invalid"
password="$(openssl rand -hex 24)"
hash="$(printf '%s' "$password" | sudo docker exec -i -w /app "$api" \
  node --input-type=module -e 'import argon2 from "argon2"; let s=""; for await(const c of process.stdin)s+=c; process.stdout.write(await argon2.hash(s,{type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1}));')"
[[ "$hash" == '$argon2id$'* ]] || { echo "Password hash generation failed" >&2; exit 1; }
printf '%s\n' \
  "INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at)" \
  "VALUES (:'uid'::uuid, :'email', 'E2E Tester','active',now());" \
  "INSERT INTO hollowgate_auth.user_roles(user_id,role) VALUES (:'uid'::uuid,'standard');" \
  "INSERT INTO hollowgate_auth.password_credentials(user_id,password_hash)" \
  "VALUES (:'uid'::uuid, :'hash');" |
  sudo docker exec -i "$db" psql -X -q -U hollowgate -d "$db_name" \
  -v ON_ERROR_STOP=1 -v "uid=$id" -v "email=$email" -v "hash=$hash" >/dev/null

login(){
  printf '{"email":"%s","password":"%s"}' "$email" "$1" |
    curl -sS -D "$tmp/login.headers" -o "$tmp/login.body" \
    -c "$tmp/cookies" -w '%{http_code}' \
    -H "Origin: $origin" -H 'Content-Type: application/json' \
    --data-binary @- "$url/auth/login"
}
status="$(login wrong-password)"
[[ "$status" == 401 ]] || { echo "Expected 401 for wrong password, got $status" >&2; exit 1; }
echo "1/5 Wrong password refused: 401"
status="$(login "$password")"
unset password
[[ "$status" == 200 ]] || { echo "Expected 200 login, got $status" >&2; cat "$tmp/login.body" >&2; exit 1; }
grep -qi '^set-cookie: __Host-hg_session=' "$tmp/login.headers" || { echo "Session cookie missing" >&2; exit 1; }
grep -qi 'HttpOnly; Secure; SameSite=Strict' "$tmp/login.headers" || { echo "Secure cookie attributes missing" >&2; exit 1; }
echo "2/5 Correct password accepted: 200, secure cookie issued"
status="$(curl -sS -b "$tmp/cookies" -o "$tmp/me.body" -w '%{http_code}' "$url/auth/me")"
[[ "$status" == 200 ]] || { echo "Expected 200 /me, got $status" >&2; cat "$tmp/me.body" >&2; exit 1; }
grep -q "$id" "$tmp/me.body" && grep -q '"role":"standard"' "$tmp/me.body" ||
  { echo "Unexpected identity/role" >&2; exit 1; }
echo "3/5 PostgreSQL session and standard role verified: 200"
status="$(curl -sS -X POST -b "$tmp/cookies" -H "Origin: $origin" -o "$tmp/logout.body" -w '%{http_code}' "$url/auth/logout")"
[[ "$status" == 200 ]] || { echo "Expected 200 logout, got $status" >&2; exit 1; }
echo "4/5 Logout succeeded: 200"
status="$(curl -sS -b "$tmp/cookies" -o "$tmp/after.body" -w '%{http_code}' "$url/auth/me")"
[[ "$status" == 401 ]] || { echo "Expected revoked session 401, got $status" >&2; exit 1; }
echo "5/5 Old session rejected after logout: 401"
echo "AUTH_E2E_SUCCESS (disposable test user removed on exit)"
