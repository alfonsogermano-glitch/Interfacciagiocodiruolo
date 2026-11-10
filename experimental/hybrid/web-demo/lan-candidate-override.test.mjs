import test from 'node:test';
import assert from 'node:assert/strict';
import {isPrivateLanIPv4,lanCandidateFromSdp,tryAddLanCandidate} from './lan-candidate-override.mjs';
const sdp='v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=mid:0\r\na=candidate:101 1 udp 2122260223 7137fc.local 55670 typ host generation 0\r\n';
test('LAN address must be valid, private IPv4 only',()=>{
 for(const ip of ['192.168.1.69','10.0.0.12','172.16.5.8','172.31.255.1'])assert.equal(isPrivateLanIPv4(ip),true);
 for(const ip of ['8.8.8.8','192.168.1.999','169.254.1.2','127.0.0.1','192.168.1.69:3000',''])assert.equal(isPrivateLanIPv4(ip),false);
});
test('replace mDNS GM candidate with explicit LAN IPv4 without editing SDP',()=>{
 const c=lanCandidateFromSdp(sdp,'192.168.1.69');
 assert.ok(c);
 assert.equal(c.sdpMid,'0');
 assert.equal(c.sdpMLineIndex,0);
 assert.match(c.candidate,/ 192\.168\.1\.69 55670 typ host/);
 assert.doesNotMatch(c.candidate,/\.local/);
 assert.match(sdp,/7137fc\.local/);
});
test('never replace public/relay or unknown candidates',()=>{
 assert.equal(lanCandidateFromSdp(sdp,'1.2.3.4'),null);
 assert.equal(lanCandidateFromSdp(sdp.replace('typ host','typ relay'),'192.168.1.69'),null);
 assert.equal(lanCandidateFromSdp(sdp.replace('7137fc.local','192.168.1.1'),'192.168.1.69'),null);
});
test('can explicitly submit extra remote candidate, without changing peer config',async()=>{
 let passed;const pc={remoteDescription:{sdp},addIceCandidate:async c=>{passed=c}};
 assert.equal(await tryAddLanCandidate(pc,'192.168.1.69'),'added');
 assert.equal(passed.sdpMid,'0');
 assert.equal(await tryAddLanCandidate({remoteDescription:null},'192.168.1.69'),'pending');
});
