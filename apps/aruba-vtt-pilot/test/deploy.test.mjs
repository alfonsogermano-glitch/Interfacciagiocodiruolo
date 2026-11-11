import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const s=readFileSync(new URL('../../../deploy/aruba/scripts/activate-vtt-campaigns.sh',import.meta.url),'utf8');
test('campaign deployment never accesses production database or removes source data',()=>{
 assert.match(s,/hollowgate_auth_test/);
 assert.match(s,/hollowgate_auth_app/);
 assert.match(s,/008_vtt_campaigns\.sql/);
 assert.doesNotMatch(s,/\-d hollowgate(?:\s|$)/);
 assert.doesNotMatch(s,/DROP DATABASE|DELETE FROM|TRUNCATE/);
});
test('activation is guarded, isolated and probes private routes',()=>{
 assert.match(s,/compose\.campaign-trial\.yaml/);
 assert.match(s,/compose\.auth-trial\.yaml/);
 assert.match(s,/caddy validate/);
 assert.match(s,/build-vtt-pilot\.sh/);
 assert.match(s,/trap rollback ERR/);
 assert.match(s,/check \/vtt\/ 401/);
 assert.match(s,/check \/vtt\/campaigns 401/);
 assert.match(s,/check \/health 200/);
});
