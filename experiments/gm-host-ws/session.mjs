import {randomBytes,timingSafeEqual} from 'node:crypto';
const token=()=>randomBytes(32).toString('base64url');
const equal=(a,b)=>{if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)};
export function createSession({initialState,onChange=()=>{}}={}){
 const gmToken=token(),playerToken=token(),members=new Map(),state=initialState??{title:'Hollowgate — demo',tokens:{gm:{x:20,y:20}},events:[]};let gm=null,sequence=0;
 const persist=()=>onChange({title:state.title,tokens:{gm:{...state.tokens.gm}},events:state.events.map(e=>({...e}))});
 const send=(ws,m)=>{if(ws?.readyState===1)ws.send(JSON.stringify(m))};
 const snapshot=ws=>send(ws,{type:'state',sequence,state});
 const broadcast=()=>{snapshot(gm);for(const ws of members.keys())snapshot(ws)};
 const detach=ws=>{if(ws===gm){gm=null;for(const p of members.keys())send(p,{type:'notice',text:'Game Master scollegato'})}else if(members.delete(ws)){delete state.tokens[ws.hgPlayerId];sequence++;broadcast()}};
 const handle=(ws,m,local)=>{
  if(!m||typeof m!=='object'||Array.isArray(m))return false;
  if(!ws.hgRole){
   if(m.type!=='hello')return false;
   if(m.role==='gm'&&local&&equal(m.token,gmToken)){if(gm&&gm!==ws)return false;gm=ws;ws.hgRole='gm';send(ws,{type:'joined',role:'gm',playerToken});snapshot(ws);return true}
   if(m.role==='player'&&equal(m.token,playerToken)&&members.size<12){const id='p'+randomBytes(6).toString('hex');ws.hgRole='player';ws.hgPlayerId=id;members.set(ws,{name:typeof m.name==='string'?m.name.trim().slice(0,32)||'Giocatore':'Giocatore'});state.tokens[id]={x:40+members.size*8,y:45};send(ws,{type:'joined',role:'player',id});sequence++;broadcast();return true}
   send(ws,{type:'error',text:'Credenziali non valide o stanza piena'});return false;
  }
  if(m.type==='ping'){send(ws,{type:'pong'});return true}
  if(m.type==='move'){const id=ws.hgRole==='gm'&&(m.id===undefined||m.id==='gm')?'gm':ws.hgRole==='player'?ws.hgPlayerId:null;if(!id)return false;const x=Number(m.x),y=Number(m.y);if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||x>100||y<0||y>100)return false;state.tokens[id]={x,y};if(id==='gm')persist();sequence++;broadcast();return true}
  if(m.type==='roll'){const sides=Number(m.sides);if(!Number.isInteger(sides)||![4,6,8,10,12,20,100].includes(sides))return false;const result=1+randomBytes(4).readUInt32BE(0)%sides;const name=ws.hgRole==='gm'?'GM':members.get(ws)?.name||'Giocatore';state.events=[...state.events.slice(-49),{name,text:'d'+sides+' → '+result}];persist();sequence++;broadcast();return true}
  return false;
 };
 return {gmToken,playerToken,handle,detach,members};
}
