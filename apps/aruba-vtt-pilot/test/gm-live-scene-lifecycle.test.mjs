import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/ArubaGmLiveScene.jsx',import.meta.url),'utf8');
test('GM component closes transport and invalidates callbacks on campaign change or unmount',()=>{
 assert.match(source,/useEffect\(\(\)=>\(\)=>\{[\s\S]*?generation\.current\+\+;[\s\S]*?session\.current\?\.close\(\);[\s\S]*?\},\[campaign\.id\]\)/);
 assert.match(source,/session\.current\?\.close\(\);session\.current=null;onChannelReady\(false\)/);
});
test('live component accepts only the exact server-verified GM or player role',()=>{
 assert.match(source,/const expectedRole=campaign\.ownerId===bootstrap\.id\?'gm':'player'/);
 assert.match(source,/const authorized=membership\?\.role===expectedRole/);
 assert.match(source,/if\(!authorized\)\{setError\('Connessione multiplayer non autorizzata'\)/);
 assert.doesNotMatch(source,/campaign\.ownerId!==bootstrap\.id/);
});
test('shipping live component mounts verified WSS callbacks and TURN before channel readiness',()=>{
 assert.match(source,/createArubaWebRtcSignalingClient/);
 assert.match(source,/client\.connectWithTurn\(window\.fetch\.bind\(window\)\)/);
 assert.match(source,/onVerifiedPeer:proof=>binding\?\.onVerifiedPeer\(proof\)/);
 assert.match(source,/onPeerRevoked:proof=>\{binding\?\.onPeerRevoked\(proof\);onChannelReady\(expectedRole==='gm'&&binding\?\.attachedCount>0\);\}/);
 assert.match(source,/onClosed:\(\)=>onChannelReady\(false\)/);
 assert.match(source,/expectedRole==='player'&&\['peer-left','peer-failed'\]\.includes\(event\.state\)/);
 assert.match(source,/binding\?\.attachChannel\(peerId,channel\)/);
 assert.doesNotMatch(source,/createAuthorizedSceneSession/);
});
test('verified transport remains mounted while its status panel is limited to an active campaign session',async()=>{
 const {readFile}=await import('node:fs/promises');
 const main=await readFile(new URL('../src/main.tsx',import.meta.url),'utf8');
 assert.match(source,/if\(!visible\)return null/);
 assert.match(main,/visible=\{section==='session'&&liveCampaignId===activeCampaign\.id\}/);
 assert.match(main,/key=\{`\$\{activeCampaign\.id\}:live`\}/);
});
