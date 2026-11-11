const localHosts=new Set(['127.0.0.1','localhost','[::1]']);
export function isLocalGmOrigin(host,origin){
 try{
  const h=new URL('http://'+host),o=new URL(origin);
  return localHosts.has(h.hostname)&&localHosts.has(o.hostname)&&o.protocol==='http:'&&o.port===h.port;
 }catch{return false}
}
