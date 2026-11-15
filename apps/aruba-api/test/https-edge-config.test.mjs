import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const load=p=>readFileSync(new URL('../../../deploy/aruba/'+p,import.meta.url),'utf8');

test('HTTPS staging gateway handles only health and readiness, not auth paths',()=>{
  const config=load('Caddyfile.staging');
  assert.match(config,/staging\.hollowgate\.quest/);
  assert.match(config,/@diagnostics path \/health \/ready/);
  assert.match(config,/respond "Not Found" 404/);
  assert.doesNotMatch(config,/(?:path|handle) \/auth\//);
});
test('staging edge uses separate docker project and only the staging network',()=>{
  const yml=load('compose.edge-staging.yaml');
  assert.match(yml,/name: hollowgate-staging-edge/);
  assert.match(yml,/hollowgate-auth-staging_default/);
  assert.match(yml,/80:80/);
  assert.match(yml,/443:443/);
  assert.doesNotMatch(yml,/hollowgate-db/);
  assert.doesNotMatch(yml,/\b300[123]:/);
});
