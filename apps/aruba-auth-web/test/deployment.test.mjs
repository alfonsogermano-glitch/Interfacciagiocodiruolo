import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = name => readFileSync(new URL('../../../deploy/aruba/scripts/'+name,import.meta.url),'utf8');
test('trial activation checks test DB, bcrypt and private auth before exposure',()=>{
  const s=read('activate-auth-trial.sh');
  assert.match(s,/hollowgate_auth_test/);
  assert.match(s,/auth_trial_hash/);
  assert.match(s,/register_local_user/);
  assert.match(s,/caddy validate/);
  assert.match(s,/probe \/auth\/signup 401/);
  assert.match(s,/trap rollback ERR/);
  assert.match(s,/AUTH_TRIAL_PRIVATE_SUCCESS/);
});
test('rollback disables features and checks public API is 404',()=>{
  const s=read('restore-auth-preview.sh');
  assert.match(s,/compose\.edge-staging\.yaml up -d/);
  assert.match(s,/compose\.auth-staging\.yaml up -d/);
  assert.match(s,/auth\/signup/);
  assert.match(s,/STATIC_PREVIEW_RESTORED/);
});

test('HTTPS activation checks local SNI and handles slow startup safely',()=>{
  const activation=read('activate-auth-trial.sh');
  const restore=read('restore-auth-preview.sh');
  assert.match(activation,/--resolve staging\.hollowgate\.quest:443:127\.0\.0\.1/);
  assert.match(activation,/attempt<=20/);
  assert.match(activation,/probe \/auth\/signup 401/);
  assert.match(activation,/probe \/login 401/);
  assert.match(activation,/probe \/auth-ui\/app\.mjs 401/);
  assert.match(activation,/probe \/health 200/);
  assert.match(activation,/trap - ERR/);
  assert.doesNotMatch(activation,/\$\{edge\[@\]:0:2\}/);
  assert.match(restore,/--resolve staging\.hollowgate\.quest:443:127\.0\.0\.1/);
  assert.match(restore,/i<=20/);
});
