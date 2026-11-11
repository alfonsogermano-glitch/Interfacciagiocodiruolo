import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';

const defaultState=()=>({title:'Hollowgate — demo',tokens:{gm:{x:20,y:20}},events:[]});
function assertValid(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==1)throw Error('Archivio campagna non valido');
 const s=value.state;
 if(!s||typeof s!=='object'||typeof s.title!=='string'||s.title.length>120||
    !s.tokens||typeof s.tokens!=='object'||Array.isArray(s.tokens)||
    Object.keys(s.tokens).length!==1||!Object.hasOwn(s.tokens,'gm')||
    !Array.isArray(s.events)||s.events.length>50)throw Error('Archivio campagna non valido');
 const {x,y}=s.tokens.gm||{};
 if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||x>100||y<0||y>100)throw Error('Archivio campagna non valido');
 for(const e of s.events){
  if(!e||typeof e.name!=='string'||e.name.length>40||typeof e.text!=='string'||e.text.length>120)
   throw Error('Archivio campagna non valido');
 }
 return {title:s.title,tokens:{gm:{x,y}},events:s.events.map(e=>({name:e.name,text:e.text}))};
}
export function createStateStore(filePath){
 const full=path.resolve(filePath);
 return {
  load(){
   try{return assertValid(JSON.parse(fs.readFileSync(full,'utf8')))}
   catch(error){
    if(error?.code==='ENOENT')return defaultState();
    throw Error('Archivio campagna danneggiato o non valido: '+error.message);
   }
  },
  save(state){
   const valid=assertValid({version:1,state:{...state,tokens:{gm:state.tokens.gm}}});
   const folder=path.dirname(full);
   fs.mkdirSync(folder,{recursive:true});
   const temp=path.join(folder,'.campaign-'+randomBytes(8).toString('hex')+'.tmp');
   try{
    fs.writeFileSync(temp,JSON.stringify({version:1,state:valid},null,2)+'\n',{encoding:'utf8',flag:'wx',mode:0o600});
    fs.renameSync(temp,full);
   }finally{try{fs.unlinkSync(temp)}catch(error){if(error?.code!=='ENOENT')throw error}}
  }
 };
}
