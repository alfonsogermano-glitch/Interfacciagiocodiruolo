#!/usr/bin/env bash
# Isolated integration test; NEVER sends mail or accesses a production database.
set -Eeuo pipefail
umask 077
db="hollowgate-postgres-1"
api="hollowgate-auth-staging-aruba-auth-staging-1"
id=""
cleanup() {
  local status=$?
  trap - EXIT
  if [[ -n "$id" ]]; then
    if ! printf "DELETE FROM hollowgate_auth.users WHERE id=:'uid'::uuid;\n" |
      sudo docker exec -i "$db" psql -X -q -U hollowgate -d hollowgate_auth_test \
        -v ON_ERROR_STOP=1 -v "uid=$id" >/dev/null; then
      echo "ERROR: disposable fixture cleanup failed" >&2
      status=1
    fi
  fi
  exit "$status"
}
trap cleanup EXIT

# Fail closed: both containers must be the intended staging containers.
sudo docker inspect "$db" "$api" >/dev/null
sudo docker exec "$api" sh -c '[ "$PGDATABASE" = hollowgate_auth_test ] && [ "$PGUSER" = hollowgate_auth_app ]' ||
  { echo "ERROR: staging database/role mismatch" >&2; exit 1; }

id="$(cat /proc/sys/kernel/random/uuid)"
email="reset-e2e-$id@example.invalid"
old="$(openssl rand -hex 24)"
new="$(openssl rand -hex 24)"
hash="$(printf '%s' "$old" | sudo docker exec -i -w /app "$api" node --input-type=module -e '
import {hashPassword} from "./src/password.mjs";
let password="";for await (const data of process.stdin) password+=data;
process.stdout.write(await hashPassword(password));
')"
[[ "$hash" == '$argon2id$'* ]] || { echo "ERROR: Argon2id hash generation failed" >&2; exit 1; }

printf '%s\n' \
  "INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at)" \
  "VALUES (:'uid'::uuid,:'email','Reset E2E Test','active',now());" \
  "INSERT INTO hollowgate_auth.user_roles(user_id,role) VALUES (:'uid'::uuid,'standard');" \
  "INSERT INTO hollowgate_auth.password_credentials(user_id,password_hash)" \
  "VALUES (:'uid'::uuid,:'hash');" |
  sudo docker exec -i "$db" psql -X -q -U hollowgate -d hollowgate_auth_test \
    -v ON_ERROR_STOP=1 -v "uid=$id" -v "email=$email" -v "hash=$hash" >/dev/null

printf '{"email":"%s","old":"%s","new":"%s"}' "$email" "$old" "$new" |
  sudo docker exec -i -w /app "$api" node --input-type=module -e '
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import pg from "pg";
import {verifyPassword} from "./src/password.mjs";
import {createLoginService,LoginRejected} from "./src/login-service.mjs";
import {createSessionRepository} from "./src/session-repository.mjs";
import {createPasswordResetService,PasswordActionRejected} from "./src/password-reset-service.mjs";

let input=""; for await (const chunk of process.stdin) input+=chunk;
const data=JSON.parse(input);
assert.match(process.env.PGDATABASE,/^hollowgate_auth_test$/);
assert.equal(process.env.PGUSER,"hollowgate_auth_app");
const pool=new pg.Pool({
  host:process.env.PGHOST,port:Number(process.env.PGPORT||5432),
  user:process.env.PGUSER,database:process.env.PGDATABASE,
  password:(await readFile(process.env.POSTGRES_PASSWORD_FILE,"utf8")).trim(),
  max:5,
});
try {
  const hmacKey=await readFile(process.env.AUTH_RATE_LIMIT_KEY_FILE);
  const login=createLoginService({pool,verifyPassword,hmacKey});
  const sessions=createSessionRepository({pool});
  let delivered="";
  const service=createPasswordResetService({
    pool,hmacKey,mailer:{async send(message) {
      const match=message.text.match(/[?&]token=([A-Za-z0-9_-]{43})/);
      assert.ok(match,"test email missing token");
      delivered=match[1];
      return {messageId:"disposable-mail-stub"};
    }},
  });
  const networkSubject="localhost-staging-rehearsal";
  const before=await login({email:data.email,password:data.old,networkSubject});
  assert.ok(await sessions.getSessionUser(before.token));
  console.log("1/6 Initial login and session: PASS");

  const unknown=await service.request({
    email:"nonexistent-"+data.email,networkSubject,
  });
  assert.equal(delivered,"");
  const ack=await service.request({email:data.email,networkSubject});
  assert.deepEqual(ack,unknown);
  assert.match(delivered,/^[A-Za-z0-9_-]{43}$/);
  console.log("2/6 Generic reset acknowledgement, mocked mail: PASS");

  await service.redeem({token:delivered,newPassword:data.new});
  assert.equal(await sessions.getSessionUser(before.token),null);
  console.log("3/6 Credential changed, old session revoked: PASS");

  await assert.rejects(
    ()=>service.redeem({token:delivered,newPassword:data.new}),
    PasswordActionRejected,
  );
  console.log("4/6 One-time token replay rejected: PASS");

  await assert.rejects(
    ()=>login({email:data.email,password:data.old,networkSubject}),
    LoginRejected,
  );
  const after=await login({email:data.email,password:data.new,networkSubject});
  assert.ok(await sessions.getSessionUser(after.token));
  console.log("5/6 Old password rejected; new password works: PASS");

  const tokenHash=await pool.query(
    "SELECT count(*)::int AS n FROM hollowgate_auth.password_actions " +
    "WHERE user_id=(SELECT id FROM hollowgate_auth.users WHERE email=$1) " +
    "AND consumed_at IS NOT NULL", [data.email]);
  assert.equal(tokenHash.rows[0].n,1);
  console.log("6/6 PostgreSQL one-time action committed: PASS");
  console.log("PASSWORD_RESET_E2E_SUCCESS (no real email sent)");
} finally { await pool.end(); }
'
echo "Disposable account will be removed by cleanup."
