// Optional same-LAN ICE workaround. The player explicitly supplies the GM LAN IPv4.
// Never send this address to signaling; it is used only in the local ICE agent.
export function isPrivateLanIPv4(input){
 if(typeof input!=='string'||!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(input))return false;
 const a=input.split('.').map(Number);
 if(a.some(x=>x>255))return false;
 if(a[0]===10)return true;
 if(a[0]===172&&a[1]>=16&&a[1]<=31)return true;
 if(a[0]===192&&a[1]===168)return true;
 return false;
}
export function lanCandidateFromSdp(sdp,ipv4){
 if(!isPrivateLanIPv4(ipv4)||typeof sdp!=='string')return null;
 const lines=sdp.split(/\r?\n/);
 let mid=null,section=-1;
 for(const line of lines){
  if(line.startsWith('m=')){section++;mid=null}
  if(line.startsWith('a=mid:'))mid=line.slice(6).trim();
  if(!line.startsWith('a=candidate:'))continue;
  const fields=line.slice(2).trim().split(/\s+/);
  if(fields.length<8||fields[6]!=='typ'||fields[7]!=='host')continue;
  if(!/\.local$/i.test(fields[4]))continue;
  const port=Number(fields[5]);
  if(fields[2].toLowerCase()!=='udp'||!Number.isInteger(port)||port<1||port>65535)continue;
  fields[4]=ipv4;
  return {candidate:fields.join(' '),sdpMid:mid??undefined,sdpMLineIndex:section>=0?section:0};
 }
 return null;
}
export async function tryAddLanCandidate(pc,ipv4){
 if(!pc?.remoteDescription?.sdp||typeof pc.addIceCandidate!=='function')return 'pending';
 const candidate=lanCandidateFromSdp(pc.remoteDescription.sdp,ipv4);
 if(!candidate)return 'no-mdns';
 try{await pc.addIceCandidate(candidate);return 'added'}
 catch(err){return 'rejected:'+String(err?.name||'error')}
}
