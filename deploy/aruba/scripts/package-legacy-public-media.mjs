#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const source=join(root,'deploy/aruba/data/supabase-export.json');
const output=join(root,'deploy/aruba/data/legacy-public-media');
const origin='https://njcnkovruynhtsgzgrxi.supabase.co';
const prefix='/storage/v1/object/public/';
const document=JSON.parse(await readFile(source,'utf8'));
const urls=new Set();
function collect(value){
 if(typeof value==='string'&&value.startsWith(origin+prefix))urls.add(value);
 else if(Array.isArray(value))value.forEach(collect);
 else if(value&&typeof value==='object')Object.values(value).forEach(collect);
}
collect(document);await mkdir(output,{recursive:true});
const manifest=[];
for(const sourceUrl of [...urls].sort()){
 const url=new URL(sourceUrl);const objectPath=decodeURIComponent(url.pathname.slice(prefix.length));
 if(!objectPath||objectPath.split('/').some(part=>!part||part==='.'||part==='..'))throw Error('Unsafe media path: '+objectPath);
 const target=join(output,...objectPath.split('/'));await mkdir(dirname(target),{recursive:true});
 const response=await fetch(sourceUrl,{redirect:'error'});
 if(!response.ok)throw Error(`Download failed ${response.status}: ${sourceUrl}`);
 const bytes=Buffer.from(await response.arrayBuffer());
 if(bytes.length<1||bytes.length>64*1024*1024)throw Error('Invalid media size: '+sourceUrl);
 await writeFile(target,bytes);
 manifest.push({sourceUrl,publicPath:'/vtt/migrated-media/'+objectPath,path:relative(output,target).replaceAll('\\','/'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),contentType:response.headers.get('content-type')??'application/octet-stream'});
}
await writeFile(join(output,'manifest.json'),JSON.stringify({version:1,count:manifest.length,items:manifest},null,2)+'\n');
console.log(`PACKAGED_LEGACY_PUBLIC_MEDIA=${manifest.length}`);
