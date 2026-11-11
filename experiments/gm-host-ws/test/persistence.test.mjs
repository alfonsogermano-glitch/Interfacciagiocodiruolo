import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSession} from '../session.mjs';
import {createStateStore} from '../state-store.mjs';

const peer=()=>({readyState:1,messages:[],send(s){this.messages.push(JSON.parse(s))}});
const latest=(p,t)=>p.messages.filter(m=>m.type===t).at(-1);
function fixture(){const dir=mkdtempSync(join(tmpdir(),'hollowgate-persist-'));return {dir,path:join(dir,'campaign.json'),cleanup:()=>rmSync(dir,{recursive:true,force:true})}}
test('GM coordinates and dice activity persist across restarts, but player session identities do not',t=>{
 const f=fixture();t.after(f.cleanup);
 const store=createStateStore(f.path);
 const s=createSession({initialState:store.load(),onChange:store.save});
 const gm=peer(),p=peer();
 assert.equal(s.handle(gm,{type:'hello',role:'gm',token:s.gmToken},true),true);
 assert.equal(s.handle(p,{type:'hello',role:'player',token:s.playerToken},false),true);
 assert.equal(s.handle(gm,{type:'move',x:61,y:47},true),true);
 assert.equal(s.handle(gm,{type:'roll',sides:20},true),true);
 const disk=JSON.parse(readFileSync(f.path,'utf8'));
 assert.equal(disk.version,1);
 assert.deepEqual(disk.state.tokens,{gm:{x:61,y:47}});
 assert.equal(disk.state.events.length,1);
 const restored=createSession({initialState:createStateStore(f.path).load()});
 const next=peer();restored.handle(next,{type:'hello',role:'gm',token:restored.gmToken},true);
 assert.deepEqual(latest(next,'state').state,disk.state);
});
test('corrupt file fails closed instead of overwriting campaign data',t=>{
 const f=fixture();t.after(f.cleanup);
 writeFileSync(f.path,'{broken');
 assert.throws(()=>createStateStore(f.path).load(),/non valido|danneggiato/i);
 assert.equal(readFileSync(f.path,'utf8'),'{broken');
});
test('malformed or out-of-range stored state is rejected',t=>{
 const f=fixture();t.after(f.cleanup);
 writeFileSync(f.path,JSON.stringify({version:1,state:{title:'demo',tokens:{gm:{x:900,y:1}},events:[]}}));
 assert.throws(()=>createStateStore(f.path).load(),/non valido/i);
});
