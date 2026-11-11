/**
 * Short-window round-trip diagnostics.
 * Do not interpret a smoothed JavaScript RTT as one-way network latency.
 */
export function makeRttMeter(capacity=20) {
 const samples=[];
 const add=value=>{
  if(!Number.isFinite(value)||value<0||value>30000)return null;
  samples.push(value);
  if(samples.length>capacity)samples.shift();
  return summary();
 };
 const summary=()=>{
  if(!samples.length)return null;
  const sorted=[...samples].sort((a,b)=>a-b);
  const median=sorted.length%2?sorted[(sorted.length-1)/2]:
   (sorted[sorted.length/2-1]+sorted[sorted.length/2])/2;
  return {min:sorted[0],median,last:samples[samples.length-1],max:sorted.at(-1),count:samples.length};
 };
 return {add,summary,clear(){samples.length=0}};
}
export function describeRtt(summary) {
 if(!summary)return 'misurazione in corso';
 return 'tipico '+Math.round(summary.median)+' ms · minimo '+Math.round(summary.min)+' ms · picco '+Math.round(summary.max)+' ms';
}
export function classifySelectedPair(stats) {
 if(!stats || typeof stats.values!=='function')return 'percorso non disponibile';
 const rows=[...stats.values()];
 const selected=rows.find(x=>x.type==='transport'&&x.selectedCandidatePairId);
 const pair=rows.find(x=>x.type==='candidate-pair'&&x.id===selected?.selectedCandidatePairId)||
  rows.find(x=>x.type==='candidate-pair'&&x.selected===true)||
  rows.find(x=>x.type==='candidate-pair'&&x.nominated===true&&x.state==='succeeded');
 if(!pair)return 'percorso non disponibile';
 const local=rows.find(x=>x.id===pair.localCandidateId),remote=rows.find(x=>x.id===pair.remoteCandidateId);
 if(!local||!remote)return 'percorso non disponibile';
 const a=local.candidateType??'?',b=remote.candidateType??'?';
 return a==='relay'||b==='relay'?'relay TURN':a+'/'+b+' (WebRTC)';
}
