import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const index = readFileSync(new URL('../src/index.mjs', import.meta.url),'utf8');
const compose = readFileSync(new URL('../../../deploy/aruba/compose.auth-staging.yaml', import.meta.url),'utf8');

test('only dedicated restricted staging user and database can enable auth',()=>{
  assert.match(index, /process\.env\.PGDATABASE !== 'hollowgate_auth_test'/);
  assert.match(index, /process\.env\.PGUSER !== 'hollowgate_auth_app'/);
  assert.match(index, /AUTH_STAGING_ENABLED === 'true'/);
  assert.match(index, /createAuthHttpHandler\(/);
  assert.match(index, /AUTH_RATE_LIMIT_KEY_FILE/);
});
test('staging API is localhost-only with separate secrets',()=>{
  assert.match(compose, /127\.0\.0\.1:3003:3000/);
  assert.match(compose, /PGDATABASE: hollowgate_auth_test/);
  assert.match(compose, /PGUSER: hollowgate_auth_app/);
  assert.match(compose, /AUTH_RATE_LIMIT_KEY_FILE: \/run\/secrets\/auth_rate_limit_key/);
  assert.match(compose, /auth_rate_limit_key:\s*\n\s*file:/);
  assert.doesNotMatch(compose, /0\.0\.0\.0:3003/);
});
