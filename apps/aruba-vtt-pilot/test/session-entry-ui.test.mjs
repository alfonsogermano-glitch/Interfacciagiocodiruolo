import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL(file,import.meta.url),'utf8');

test('campaign session entry requires exact bootstrap membership and role',()=>{
 const main=read('../src/main.tsx');
 assert.match(main,/user\.campaignMemberships\.find\(member=>member\.userId===user\.id&&member\.campaignId===activeCampaign\.id\)/);
 assert.match(main,/activeSessionRole=activeCampaignOwned\?'gm':'player'/);
 assert.match(main,/user\?\.gameSessionEnabled&&activeSessionMembership\?\.role===activeSessionRole/);
 assert.match(main,/if\(activeSessionEnabled\)\{setLiveChannelReady\(false\);setLiveCampaignId/);
});

test('original campaign-home labels control the authorized transport explicitly',()=>{
 const home=read('../src/ArubaCampaignHome.tsx');
 const live=read('../src/ArubaGmLiveScene.jsx');
 const main=read('../src/main.tsx');
 assert.match(home,/sessionActive\?'Termina':'Avvia sessione'/);
 assert.match(home,/sessionActive\?'Esci dalla sessione':'Entra nella sessione'/);
 assert.match(live,/if\(active===true\)start\(\)/);
 assert.match(live,/if\(active===false\)stop\(\)/);
 assert.match(live,/if\(!authorized\)\{setError\('Connessione multiplayer non autorizzata'\)/);
 assert.match(home,/sessionActive&&<button type="button" disabled=\{!sessionReady\} onClick=\{onOpenMap\}/);
 assert.match(main,/onOpenMap=\{\(\)=>\{if\(activeSessionEnabled&&liveCampaignId===activeCampaign\.id&&liveChannelReady\)/);
});
