import { existsSync, readFileSync } from 'node:fs';

const server = readFileSync('supabase/functions/server/index.tsx', 'utf8');
const context = readFileSync('src/app/campaigns/CampaignContext.tsx', 'utf8');
const campaignHome = readFileSync('src/app/campaigns/CampaignHome.tsx', 'utf8');
const myCharactersPage = readFileSync('src/app/components/gm/MyCharactersPage.tsx', 'utf8');
const entityKebabMenu = readFileSync('src/app/components/session/shared/EntityKebabMenu.tsx', 'utf8');
const deleteMigrationPath = 'supabase-p0-4-campaign-delete-membership.sql';
const deleteMigration = existsSync(deleteMigrationPath)
  ? readFileSync(deleteMigrationPath, 'utf8')
  : '';

const failures = [];

for (const required of [
  'function mapCampaignRow',
  'campaign_invite_codes',
  'deleted_at',
  'async function mirrorPlayerCampaignsKv',
  'await mirrorPlayerCampaignsKv(profileId)',
  'async function softDeleteCampaignAndRevokeMembers',
  'await softDeleteCampaignAndRevokeMembers(userId, campaignId)',
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

if (!deleteMigration) {
  failures.push(`Missing P0.4 campaign delete migration: ${deleteMigrationPath}`);
} else {
  for (const required of [
    'soft_delete_campaign_and_revoke_members',
    'security definer',
    'set search_path = public',
    'revoke all on function public.soft_delete_campaign_and_revoke_members',
    'grant execute on function public.soft_delete_campaign_and_revoke_members',
    'to service_role',
  ]) {
    if (!deleteMigration.toLowerCase().includes(required.toLowerCase())) {
      failures.push(`Campaign delete migration missing required marker: ${required}`);
    }
  }
}

if (context.includes('campaignSyncService')) {
  failures.push('CampaignContext still imports the legacy client-side campaign SQL mirror service');
}
if (context.includes('ensureCampaignExistsInDB')) {
  failures.push('CampaignContext still invokes ensureCampaignExistsInDB');
}

for (const required of [
  'const gmAssignedCharacters =',
  '.filter((ch) => !ch.availableForPlayers)',
  'profileId: activeCampaign.ownerId',
  'characters: gmAssignedCharacters',
]) {
  if (!campaignHome.includes(required)) {
    failures.push(`CampaignHome must keep assigned GM-owned PCs in Personaggi: ${required}`);
  }
}

if (!campaignHome.includes('isOwner && row && row.profileId !== activeCampaign?.ownerId')) {
  failures.push('CampaignHome must never offer Rimuovi giocatore on the synthetic GM row');
}

if (!campaignHome.includes('await setCharacterAvailableForPlayers(ch.id, nextAvailable, SERVER_BASE, accessToken);\n      setPlayersReloadToken((t) => t + 1);')) {
  failures.push('CampaignHome must reload character grouping after either availability toggle direction');
}

if (!entityKebabMenu.includes('labelClassName?: string;')) {
  failures.push('EntityKebabMenu must support an optional labelClassName for state-aware menu labels');
}

if (!entityKebabMenu.includes('<span className={item.labelClassName}>{item.label}</span>')) {
  failures.push('EntityKebabMenu must apply labelClassName only to the label text');
}

if (!campaignHome.includes("labelClassName: ch.availableForPlayers ? undefined : 'text-[var(--dash-muted)] opacity-40'")) {
  failures.push('CampaignHome must make the OFF Disponibile per i giocatori label clearly muted and lower-opacity');
}

if (!myCharactersPage.includes("labelClassName: char.availableForPlayers ? undefined : 'text-[var(--dash-muted)] opacity-40'")) {
  failures.push('MyCharactersPage must make the OFF Disponibile per i giocatori label clearly muted and lower-opacity');
}

for (const [source, sourceName, idExpression] of [
  [myCharactersPage, 'MyCharactersPage', 'char.id'],
  [campaignHome, 'CampaignHome', 'ch.id'],
]) {
  for (const required of [
    'const availabilityToggleLocksRef = useRef<Set<string>>(new Set());',
    `if (availabilityToggleLocksRef.current.has(${idExpression})) return;`,
    `availabilityToggleLocksRef.current.add(${idExpression});`,
    `finally {\n      availabilityToggleLocksRef.current.delete(${idExpression});\n    }`,
  ]) {
    if (!source.includes(required)) {
      failures.push(`${sourceName} must ignore repeated availability clicks while the same character update is pending: ${required}`);
    }
  }
}

if (failures.length > 0) {
  console.error('P0 canonical campaign contract failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('P0 canonical campaign contract: PASS');