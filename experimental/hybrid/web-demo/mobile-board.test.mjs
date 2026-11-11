import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const code=readFileSync(new URL('./demo.js',import.meta.url),'utf8');
const start=code.indexOf('function render(){');
const end=code.indexOf('\nfunction act(',start);
assert.ok(start>=0 && end>start,'render() must exist');
const renderSource=code.slice(start,end);

test('Android-sized quick player page reveals board, tokens, timeline and scrolls once',()=>{
 const elements=new Map();
 let scrollCount=0,diagnostic='';
 const node=id=>{
  if(!elements.has(id)){
   const x={hidden:id==='session',textContent:'',style:{},className:'',children:[],
    append(child){this.children.push(child)},
    replaceChildren(){this.children=[]},
    scrollIntoView(){scrollCount++}};
   elements.set(id,x);
  }
  return elements.get(id);
 };
 const state={title:'Campagna demo',sequence:2,role:'player',self:'P-aa',tokens:{
  gm:{owner:'gm',x:20,y:20},'P-aa':{owner:'P-aa',x:40,y:55}
 },activity:[{sequence:1,label:'nota pubblica',visibility:'public'}]};
 const createElement=()=>({style:{},className:'',textContent:''});
 const render=new Function('mode','hostState','playerState','snapshot','$','document','quickDiag','requestAnimationFrame',
  renderSource+'\nreturn render;')('player',null,state,()=>state,node,{createElement},
  message=>diagnostic=message,callback=>callback());
 render();
 assert.equal(node('session').hidden,false);
 assert.equal(node('sessionTitle').textContent,'Campagna demo');
 assert.equal(node('board').children.length,2);
 assert.equal(node('timeline').children.length,1);
 assert.equal(scrollCount,1);
 assert.match(diagnostic,/visualizzazione attiva/);
 render();
 assert.equal(scrollCount,1,'later snapshots must not hijack mobile scrolling');
});

test('no board is displayed until a player snapshot exists',()=>{
 const els=new Map(),node=id=>{
  if(!els.has(id))els.set(id,{hidden:true});
  return els.get(id);
 };
 const render=new Function('mode','hostState','playerState','snapshot','$','document','quickDiag','requestAnimationFrame',
  renderSource+'\nreturn render;')('player',null,null,()=>null,node,{createElement:()=>({})},()=>{},()=>{});
 render();
 assert.equal(node('session').hidden,true);
});
