import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const start=path.join(root,'src/app');
const primitives=/<(?:EntityKebabMenu|DropdownMenuItem|ContextMenuItem|FolderSectionHeader|SectionHeader|EntityDetailRail)\b/;
const rows=[];
function walk(directory){
 for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
  const file=path.join(directory,entry.name);
  if(entry.isDirectory())walk(file);
  else if(entry.name.endsWith('.tsx')){
   const lines=fs.readFileSync(file,'utf8').split('\n');
   for(let index=0;index<lines.length;index++){
    if(primitives.test(lines[index]))rows.push({
     path:path.relative(root,file).replaceAll('\\','/'),line:index+1,
     source:lines.slice(index,Math.min(lines.length,index+4)).join('\n').trim(),
    });
   }
  }
 }
}
walk(start);
const destination=path.join(root,'.local/original-menu-parity-inventory.json');
fs.writeFileSync(destination,JSON.stringify({version:1,scope:'Original menu/section call sites, NOT proof of runtime parity',rows},null,2)+'\n');
console.log(`ORIGINAL_MENU_INVENTORY_OK: ${rows.length} call sites in ${new Set(rows.map(row=>row.path)).size} source files`);
console.log('Report: .local/original-menu-parity-inventory.json');
