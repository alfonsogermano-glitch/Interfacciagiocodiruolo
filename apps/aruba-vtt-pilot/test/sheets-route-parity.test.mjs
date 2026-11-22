import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const pilot=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8');
test('Schede route uses authoritative Aruba roster and original detail boundary',()=>{
 assert.match(pilot,/section==='sheets'&&activeCampaign&&<section/);
 assert.match(pilot,/user\.campaignRosterEnabled\?<ArubaCampaignPlayerRows/);
 assert.match(pilot,/:<ArubaCampaignCharacterCards/);
 assert.match(pilot,/\(section==='characters'\|\|section==='sheets'\)&&entityDetail/);
 assert.match(pilot,/availabilityEnabled=\{user\.characterAvailabilityEnabled\}/);
 assert.match(pilot,/assignmentsEnabled=\{user\.characterAssignmentsEnabled\}/);
});
test('Schede remains disabled without a selected campaign or character capability',()=>{
 assert.match(pilot,/section==='sheets'&&!activeCampaign/);
 assert.match(pilot,/user\.charactersEnabled\?/);
 assert.match(pilot,/Servizio schede non disponibile/);
});
