/**
 * PeerJS DataConnection -> RTCPeerConnection-like data-channel adapter.
 * Incoming PeerJS 'connection' can be emitted after raw.open became true;
 * never rely solely on observing the raw 'open' event.
 */
export function adaptPeerJsConnection(raw,{onError=()=>{}}={}) {
 let closed=false;
 const adapter={
  onopen:null,onclose:null,onmessage:null,
  get readyState(){return closed?'closed':raw.open===true?'open':'connecting'},
  send(value){
   if(adapter.readyState!=='open')throw Error('PeerJS data channel is not open');
   raw.send(JSON.parse(value));
  },
  close(){raw.close()}
 };
 raw.on('open',()=>{if(!closed)adapter.onopen?.()});
 raw.on('data',packet=>{
  if(closed)return;
  if(packet&&typeof packet==='object')adapter.onmessage?.({data:JSON.stringify(packet)});
 });
 const close=()=>{if(closed)return;closed=true;adapter.onclose?.()};
 raw.on('close',close);
 raw.on('error',error=>{onError(error);close()});
 return adapter;
}
