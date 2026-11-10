/**
 * ICE candidate diagnostics without displaying local IP addresses.
 * These counts distinguish no candidate gathering from unsuccessful pair checks.
 */
export function summarizeIceStats(report) {
 if(!report||typeof report.values!=='function')return 'statistiche non disponibili';
 const rows=[...report.values()];
 const local=rows.filter(v=>v.type==='local-candidate');
 const remote=rows.filter(v=>v.type==='remote-candidate');
 const pairs=rows.filter(v=>v.type==='candidate-pair');
 const succeeded=pairs.filter(v=>v.state==='succeeded').length;
 const inProgress=pairs.filter(v=>v.state==='in-progress').length;
 const failed=pairs.filter(v=>v.state==='failed').length;
 const kinds=candidates=>['host','srflx','prflx','relay']
  .map(type=>type+':'+candidates.filter(v=>v.candidateType===type).length).join(' ');
 return 'ICE locale ['+kinds(local)+'] remoto ['+kinds(remote)+'] coppie '+pairs.length+' (ok '+succeeded+', prova '+inProgress+', fallite '+failed+')';
}
export async function inspectIceConnection(raw,onReport) {
 const pc=raw?.peerConnection;
 if(!pc||typeof pc.getStats!=='function')return 'RTCPeerConnection non disponibile';
 try {
  const stats=await pc.getStats();
  const text=summarizeIceStats(stats);
  onReport?.(text);
  return text;
 }catch(error){
  return 'Statistiche ICE non disponibili: '+String(error?.message??'errore');
 }
}
