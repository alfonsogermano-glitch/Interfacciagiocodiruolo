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

test('campaign edit migration is installed only after 008 in staging test database',()=>{
 assert.match(s,/009_vtt_campaign_updates\.sql/);
 assert.ok(s.indexOf('008_vtt_campaigns.sql')<s.indexOf('009_vtt_campaign_updates.sql'));
 assert.match(s,/-d hollowgate_auth_test < deploy\/aruba\/sql\/009_vtt_campaign_updates\.sql/);
});

test('character schema is applied after the campaigns before activating staging',()=>{
 assert.match(s,/010_vtt_character_drafts\.sql/);
 assert.ok(s.indexOf('009_vtt_campaign_updates.sql')<s.indexOf('010_vtt_character_drafts.sql'));
 assert.match(s,/compose\.character-trial\.yaml/);
});

test('Caddy proxies the real character API before the VTT index.html fallback',()=>{
 const caddy=readFileSync(new URL('../../../deploy/aruba/Caddyfile.auth-trial',import.meta.url),'utf8');
 const route=caddy.match(/@vttDataAPI path ([^\n]+)/)?.[1]??'';
 for(const path of ['/vtt/bootstrap','/vtt/campaigns','/vtt/campaigns/*','/vtt/characters','/vtt/characters/*'])
  assert.ok(route.split(' ').includes(path),'Missing API path: '+path);
 const proxy=caddy.indexOf('handle @vttDataAPI');
 const spa=caddy.indexOf('handle_path /vtt/*');
 assert.ok(proxy>=0&&spa>proxy,'API route must precede the SPA fallback');
 assert.match(caddy.slice(proxy,spa),/reverse_proxy aruba-auth-staging:3000/);
 const query='/vtt/characters?campaignId=';
 assert.ok(query.startsWith('/vtt/characters?'));
 assert.match(s,/check \/vtt\/characters 401/);
 assert.match(s,/check \/vtt\/characters\/00000000-0000-4000-8000-000000000000 401/);
});
