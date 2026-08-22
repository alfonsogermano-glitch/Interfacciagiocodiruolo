import { readFileSync } from 'node:fs';

const server = readFileSync('supabase/functions/server/index.tsx', 'utf8');
const context = readFileSync('src/app/campaigns/CampaignContext.tsx', 'utf8');

const failures = [];

for (const required of [
  'function mapCampaignRow',
  'campaign_invite_codes',
  'deleted_at',
]) {
  if (!server.includes(required)) failures.push(`Edge Function missing required SQL-canonical marker: ${required}`);
}

for (const forbidden of [
  'kv.get(campaignsKey(',
  'kv.get(campaignMembersKey(',
  'kv.get(playerCampaignsKey(',
  'kv.get(inviteCodeKey(',
]) {
  if (server.includes(forbidden)) failures.push(`Edge Function still reads legacy KV as campaign authority: ${forbidden}`);
}

if (context.includes('campaignSyncService')) {
  failures.push('CampaignContext still imports the legacy client-side campaign SQL mirror service');
}
if (context.includes('ensureCampaignExistsInDB')) {
  failures.push('CampaignContext still invokes ensureCampaignExistsInDB');
}

if (failures.length > 0) {
  console.error('P0.3 canonical campaign contract failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('P0.3 canonical campaign contract: PASS');
