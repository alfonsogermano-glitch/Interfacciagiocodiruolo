import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const imageFields=['logo_url','cover_image_url','portrait_url','portrait_image_url',
 'portrait_cropped_image_url','portrait_source_image_url','image_url'];

/** Offline only: no network, no database writes, no source payload disclosure. */
export function inventoryImages(data,manifest,readFile){
 const packaged=new Map(manifest.items.map(item=>[item.sourceUrl,item]));
 const rows=[];
 for(const table of ['campaigns','characters','npcs','monsters']){
  for(const row of data[table]??[]){
   for(const field of imageFields){
    const value=row[field];
    if(typeof value!=='string'||!value)continue;
    let status='missing-file',bytes=0,sha256=null,mime=null,publicPath=null;
    const item=packaged.get(value);
    if(item){
     try{
      const binary=readFile(item.path);
      bytes=binary.length;sha256=digest(binary);
      status=bytes===item.bytes&&sha256===item.sha256?'verified-file':'integrity-error';
      mime=item.contentType;publicPath=item.publicPath;
     }catch{status='missing-file';}
    }else{
     const inline=/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/i.exec(value);
     if(inline){
      const binary=Buffer.from(inline[2],'base64');
      bytes=binary.length;sha256=digest(binary);mime=inline[1].toLowerCase();
      status=bytes>0&&binary.toString('base64')===inline[2]?'verified-inline':'invalid-inline';
     }
    }
    rows.push({table,entityId:row.id,campaignId:table==='campaigns'?row.id:row.campaign_id,
     field,status,bytes,sha256,mime,publicPath});
   }
  }
 }
 const summary={};
 for(const row of rows){
  const key=`${row.table}.${row.field}`;
  summary[key]??={total:0,verified:0,unavailable:0};
  summary[key].total++;
  summary[key][row.status.startsWith('verified-')?'verified':'unavailable']++;
 }
 return {version:1,summary,rows};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
 const dataRoot=path.join(root,'deploy/aruba/data');
 const data=JSON.parse(fs.readFileSync(path.join(dataRoot,'supabase-export.json'),'utf8'));
 const manifest=JSON.parse(fs.readFileSync(path.join(dataRoot,'legacy-public-media/manifest.json'),'utf8'));
 const report=inventoryImages(data,manifest,relative=>{
  const mediaRoot=path.join(dataRoot,'legacy-public-media');
  const file=path.resolve(mediaRoot,relative);
  if(!file.startsWith(mediaRoot+path.sep))throw Error('Image outside private data directory');
  return fs.readFileSync(file);
 });
 const destination=path.join(root,'.local/image-recovery-inventory.json');
 fs.writeFileSync(destination,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report.summary,null,2));
 console.log('PRIVATE_INVENTORY_WRITTEN: .local/image-recovery-inventory.json');
}
