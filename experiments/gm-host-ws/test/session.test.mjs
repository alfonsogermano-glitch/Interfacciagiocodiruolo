import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession} from '../session.mjs';
function peer(){return {readyState:1,messages:[],send(data){this.messages.push(JSON.parse(data))}}}
const latest=(ws,type)=>ws.messages.filter(x=>x.type===type).at(-1);
test('GM local auth and player invite',()=>{const s=createSession(),gm=peer();assert.equal(s.handle(gm,{type:'hello',role:'gm',token:s.gmToken},false),false);assert.equal(s.handle(gm,{type:'hello',role:'gm',token:s.gmToken},true),true);assert.equal(latest(gm,'joined').playerToken,s.playerToken)});
test('Player cannot move GM token',()=>{const s=createSession(),gm=peer(),p=peer();s.handle(gm,{type:'hello',role:'gm',token:s.gmToken},true);assert.equal(s.handle(p,{type:'hello',role:'player',token:s.playerToken},false),true);const id=latest(p,'joined').id;s.handle(p,{type:'move',id:'gm',x:42,y:15},false);assert.equal(latest(gm,'state').state.tokens.gm.x,20);assert.equal(latest(gm,'state').state.tokens[id].x,42);assert.equal(s.handle(p,{type:'move',x:9999,y:15},false),false)});
test('GM detach notifies players',()=>{const s=createSession(),gm=peer(),p=peer();s.handle(gm,{type:'hello',role:'gm',token:s.gmToken},true);s.handle(p,{type:'hello',role:'player',token:s.playerToken},false);s.detach(gm);assert.match(latest(p,'notice').text,/scollegato/)});
