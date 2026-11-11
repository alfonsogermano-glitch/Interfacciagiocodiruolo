// Parse Cloudflare's streaming log without storing credentials or IP addresses.
export function createTunnelUrlScanner(onUrl){
 let buffer='';const emitted=new Set();
 return chunk=>{
  buffer=(buffer+String(chunk)).slice(-12000);
  const matches=buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/gi)||[];
  for(const url of matches){if(!emitted.has(url)){emitted.add(url);onUrl(url)}}
 };
}
