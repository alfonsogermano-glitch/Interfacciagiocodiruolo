import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL(file,import.meta.url),'utf8');
test('shipping player map mounts original SessionWorkspace only during an explicitly active verified session',()=>{
 const adapter=read('../src/ArubaOriginalPlayerSessionWorkspace.tsx'),main=read('../src/main.tsx');
 assert.match(adapter,/<SessionWorkspace/);assert.match(adapter,/isOwner=\{false\}/);
 assert.doesNotMatch(adapter,/allowOwnerPublicationWithoutChannel|onAuthoritativeMapRuntime/);
 assert.match(main,/!activeCampaignOwned&&user\.gameSessionEnabled&&liveCampaignId===activeCampaign\.id&&liveChannelReady/);
});
test('Aruba active scene adapter is owner-write/player-read and uses only verified campaign runtime',()=>{
 const source=read('../src/ArubaSessionActiveScene.ts');
 assert.match(source,/if\(campaignId&&owner\)void loadCampaignDocumentOrNull/);
 assert.match(source,/if\(!owner\|\|!campaignId/);
 assert.match(source,/useCampaignChannel\(campaignId/);
 assert.match(source,/send\('active_scene_change',\{activeScene\}\)/);
});
