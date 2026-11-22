const LEGACY_ORIGIN='https://njcnkovruynhtsgzgrxi.supabase.co';
const LEGACY_PREFIX='/storage/v1/object/public/';
export function arubaLegacyMediaUrl(value){
 if(typeof value!=='string')return value;
 try{const url=new URL(value);if(url.origin!==LEGACY_ORIGIN||!url.pathname.startsWith(LEGACY_PREFIX))return value;
  const path=url.pathname.slice(LEGACY_PREFIX.length);if(!path||path.split('/').some(part=>!part||part==='.'||part==='..'))return '';
  return '/vtt/migrated-media/'+path;
 }catch{return value;}
}
export function rewriteArubaLegacyMedia(value){
 if(typeof value==='string')return arubaLegacyMediaUrl(value);
 if(Array.isArray(value))return value.map(rewriteArubaLegacyMedia);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,rewriteArubaLegacyMedia(item)]));
 return value;
}
