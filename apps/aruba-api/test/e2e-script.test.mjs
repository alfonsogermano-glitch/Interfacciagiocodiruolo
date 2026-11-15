import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const script=readFileSync(new URL('../../../deploy/aruba/scripts/test-auth-e2e.sh',import.meta.url),'utf8');
test('E2E script is restricted to loopback and disposable database',()=>{
  assert.match(script,/http:\/\/127/);
  assert.match(script,/hollowgate_auth_test/);
  assert.match(script,/trap cleanup EXIT/);
  assert.match(script,/DELETE FROM hollowgate_auth.users/);
  assert.match(script,/\/auth\/login/);
  assert.match(script,/\/auth\/me/);
  assert.match(script,/\/auth\/logout/);
});
