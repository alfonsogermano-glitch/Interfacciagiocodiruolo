#!/usr/bin/env bash
# Local-only signup/email verification test. No real emails or user migrations.
set -Eeuo pipefail
umask 077
db="hollowgate-postgres-1"
api="hollowgate-auth-staging-aruba-auth-staging-1"
email=""
cleanup() {
  local code=$?
  trap - EXIT
  if [[ -n "$email" ]]; then
    if ! printf "DELETE FROM hollowgate_auth.users WHERE email=:'email' AND source='local';\n" |
       sudo docker exec -i "$db" psql -X -q -v ON_ERROR_STOP=1 \
       -v "email=$email" -U hollowgate -d hollowgate_auth_test >/dev/null; then
      echo "ERROR: disposable registration cleanup failed" >&2
      code=1
    fi
  fi
  exit "$code"
}
trap cleanup EXIT
sudo docker inspect "$db" "$api" >/dev/null
sudo docker exec "$api" sh -c '[ "$PGDATABASE" = hollowgate_auth_test ] && [ "$PGUSER" = hollowgate_auth_app ]' ||
  { echo "Invalid staging DB or runtime user" >&2; exit 1; }
id="$(cat /proc/sys/kernel/random/uuid)"
email="signup-e2e-$id@example.invalid"
password="$(openssl rand -hex 24)"
printf '{"email":"%s","password":"%s"}' "$email" "$password" |
sudo docker exec -i -w /app "$api" node --input-type=module -e '
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import pg from "pg";
import {createSignupService,SignupRejected} from "./src/signup-service.mjs";
import {createLoginService,LoginRejected} from "./src/login-service.mjs";
import {createSessionRepository} from "./src/session-repository.mjs";
import {verifyPassword} from "./src/password.mjs";

let input=""; for await(const chunk of process.stdin)input+=chunk;
const data=JSON.parse(input);
assert.equal(process.env.PGDATABASE,"hollowgate_auth_test");
assert.equal(process.env.PGUSER,"hollowgate_auth_app");
const pool=new pg.Pool({
  host:process.env.PGHOST,port:Number(process.env.PGPORT||5432),
  user:process.env.PGUSER,database:process.env.PGDATABASE,
  password:(await readFile(process.env.POSTGRES_PASSWORD_FILE,"utf8")).trim(),
  max:4,
});
try {
  const hmacKey=await readFile(process.env.AUTH_RATE_LIMIT_KEY_FILE);
  let delivered=null;
  let sends=0;
  const mailer={async send(message){
    sends++;
    assert.equal(message.to,data.email);
    const match=message.text.match(/[?&]token=([A-Za-z0-9_-]{43})/);
    assert.ok(match,"missing verification link");
    delivered=match[1];
    return {messageId:"mock-only"};
  }};
  const signup=createSignupService({pool,mailer,hmacKey});
  const login=createLoginService({pool,verifyPassword,hmacKey});
  const sessions=createSessionRepository({pool});
  const signupData={
    email:data.email,displayName:"Disposable player",password:data.password,
    networkSubject:"local-test",
  };
  const ack=await signup.signup(signupData);
  assert.match(ack.message,/Se la registrazione/);
  assert.match(delivered,/^[A-Za-z0-9_-]{43}$/);
  console.log("1/6 Pending signup and mock verification email: PASS");

  await assert.rejects(
    ()=>login({email:data.email,password:data.password,networkSubject:"local-test"}),
    LoginRejected);
  console.log("2/6 Unverified login refused: PASS");

  const again=await signup.signup(signupData);
  assert.deepEqual(again,ack);
  assert.equal(sends,1);
  console.log("3/6 Duplicate signup cannot resend/replace account: PASS");

  assert.deepEqual(await signup.verify({token:delivered}),{status:"ok"});
  console.log("4/6 One-time email verification succeeded: PASS");

  await assert.rejects(()=>signup.verify({token:delivered}),SignupRejected);
  console.log("5/6 Verification token replay refused: PASS");

  const session=await login({
    email:data.email,password:data.password,networkSubject:"local-test",
  });
  const user=await sessions.getSessionUser(session.token);
  assert.equal(user.email,data.email);
  assert.equal(user.role,"standard");
  console.log("6/6 Verified standard user login and session: PASS");
  console.log("SIGNUP_E2E_SUCCESS (no real email sent)");
} finally {await pool.end();}
'
echo "Disposable signup account removed by cleanup."
