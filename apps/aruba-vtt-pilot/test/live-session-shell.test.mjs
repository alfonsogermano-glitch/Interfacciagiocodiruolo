import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const main=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8');

test('live shell hides the dashboard rail only after authorized explicit entry',()=>{
 assert.match(main,/liveSessionShellActive=\(section==='session'\|\|section==='map'\)&&!!activeCampaign&&liveCampaignId===activeCampaign\.id&&activeSessionEnabled/);
 assert.match(main,/leftSidebar=\{liveSessionShellActive\?null:<LeftSidebar/);
 assert.match(main,/sessionRailActive=\(section==='session'\|\|section==='map'\)&&!!activeCampaign/);
 assert.match(main,/rightSidebar=\{sessionRailActive&&activeCampaign\?/);
});

test('live shell does not claim map workspace or realtime readiness',()=>{
 assert.match(main,/ownerSessionWorkspaceActive=section==='map'/);
 assert.doesNotMatch(main,/sessionWorkspaceActive=\{liveSessionShellActive\}/);
 const channel=readFileSync(new URL('../src/ArubaSessionCampaignChannel.ts',import.meta.url),'utf8');
 assert.match(channel,/subscribeCampaignChannel\(campaignId/);
 assert.match(channel,/setIsReady\(false\)/);
});
