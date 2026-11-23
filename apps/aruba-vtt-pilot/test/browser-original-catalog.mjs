// Browser contract with synthetic API fixtures. NOT production acceptance.
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,sep,extname} from 'node:path';
import {chromium} from 'playwright-core';
const directory=resolve(process.argv[2]??'../../deploy/aruba/dist/vtt-pilot');
assert.ok(existsSync(resolve(directory,'index.html')),'Build original catalog contract first');
const owner='11111111-1111-4111-8111-111111111111';
const npcId='22222222-2222-4222-8222-222222222222',monsterId='33333333-3333-4333-8333-333333333333';
const createdId='44444444-4444-4444-8444-444444444444';
const date='2026-11-23T12:00:00.000Z';
const entry=(kind,id,name,data={})=>({kind,id,name,data,ownerId:owner,campaignId:null,ruleset:'hsc',
 revision:1,media:[],createdAt:date,updatedAt:date});
const entries={characters:[],npcs:[entry('npcs',npcId,'Custode QA',{description:'PNG originale',notes:'',freschezza:12})],
 monsters:[entry('monsters',monsterId,'Ombra QA',{description:'Mostro originale',notes:'',freschezza:12,attacco:'Base'})]};
const executablePath=process.env.HG_BROWSER_EXECUTABLE??
 ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
const browser=await chromium.launch({headless:true,args:['--disable-extensions','--disable-component-extensions-with-background-pages'],
 ...(executablePath?{executablePath}:{})});
// Static fixture server, not Vite preview (which inherits API proxy settings).
const server=createServer((request,response)=>{
 try{
  const path=new URL(request.url,'http://localhost').pathname;
  const relative=path==='/vtt/'?'index.html':decodeURIComponent(path.replace(/^\/vtt\//,''));
  const file=resolve(directory,relative);
  if(!file.startsWith(directory+sep))throw Error('Outside fixture directory');
  const bytes=readFileSync(file);
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
  // Block unrelated host-injected inline scripts, not application errors.
  response.writeHead(200,{'Content-Type':types[extname(file)]??'application/octet-stream',
   'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; object-src 'none'"});response.end(bytes);
 }catch{response.writeHead(404);response.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}/vtt/`;
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[],unexpected=[],external=[];
 let creates=0,updates=0;
 page.on('pageerror',error=>errors.push({message:error.message,stack:error.stack?.slice(0,1800)}));
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname;
  if(url.origin!==new URL(base).origin){external.push(url.origin);return route.abort();}
  if(path==='/vtt/'||path==='/vtt/index.html'||path.startsWith('/vtt/assets/')||
   /\.(?:png|svg|woff2?|ico)$/.test(path))return route.continue();
  let payload;
  if(path==='/vtt/bootstrap')payload={backend:'aruba-staging',
   user:{id:owner,email:'qa@example.invalid',displayName:'GM QA',role:'standard'},
   capabilities:{campaigns:{read:true,write:true},characters:{read:true,write:true},
    logicalCharacters:{read:true,write:true},nativeCatalog:{read:true,write:true},gameSession:false}};
  else if(path==='/vtt/campaigns'||path==='/vtt/player-campaigns')payload={campaigns:[]};
  else if(path==='/vtt/characters')payload={characters:[],nextCursor:null};
  else{
   const match=/^\/vtt\/catalog\/unassigned\/(characters|npcs|monsters)$/.exec(path);
   if(match&&request.method()==='GET')payload={items:entries[match[1]],nextCursor:null};
   else if(match&&request.method()==='POST'){
    creates++;
    if(creates===1)return route.fulfill({status:503,contentType:'application/json',body:'{"error":"Simulated create failure"}'});
    const body=request.postDataJSON();
    assert.equal(match[1],'npcs');assert.equal(body.ruleset,'hsc');
    assert.equal(body.revision,undefined);assert.equal(body.data.ownerProfileId,undefined);
    const item=entry('npcs',createdId,body.name,body.data);
    entries.npcs.push(item);payload={item};
   }else if(path===`/vtt/catalog/unassigned/npcs/${createdId}`&&request.method()==='PUT'){
    updates++;
    const body=request.postDataJSON();
    assert.equal(body.revision,1);assert.equal(body.name,'PNG modificato QA');
    const item={...entries.npcs.at(-1),name:body.name,data:body.data,revision:2};
    entries.npcs[entries.npcs.length-1]=item;payload={item};
   }else{unexpected.push(request.method()+' '+path);return route.fulfill({status:404,contentType:'application/json',body:'{"error":"Unexpected fixture endpoint"}'});}
  }
  await route.fulfill({status:request.method()==='POST'?201:200,contentType:'application/json',body:JSON.stringify(payload)});
 });
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'Personaggi',exact:true}).click();
 await page.getByRole('button',{name:'Nuovo personaggio',exact:true}).waitFor();
 await page.getByRole('button',{name:'PNG',exact:true}).click();
 await page.getByText('Custode QA',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Mostri',exact:true}).click();
 await page.getByText('Ombra QA',{exact:true}).waitFor();
 assert.equal(creates,0,'Browsing tabs must not write anything');
 await page.getByRole('button',{name:'PNG',exact:true}).click();
 await page.getByRole('button',{name:'Nuovo PNG',exact:true}).click();
 await page.getByRole('button',{name:/High School Cthulhu/}).click();
 await page.getByRole('button',{name:'Crea PNG',exact:true}).waitFor();
 assert.equal(creates,0,'Opening a draft must not persist it');
 await page.getByPlaceholder('Nome del PNG',{exact:true}).fill('Nuovo PNG QA');
 await page.getByRole('button',{name:'Crea PNG',exact:true}).click();
 await page.getByText('Operazione catalogo non riuscita (503).',{exact:true}).waitFor();
 assert.equal(await page.getByPlaceholder('Nome del PNG',{exact:true}).inputValue(),'Nuovo PNG QA');
 assert.equal(entries.npcs.length,1,'Failed create must not become a saved card');
 await page.getByRole('button',{name:'Crea PNG',exact:true}).click();
 await page.getByRole('button',{name:'Crea PNG',exact:true}).waitFor({state:'detached'});
 const saved=page.waitForResponse(response=>response.url().endsWith(`/vtt/catalog/unassigned/npcs/${createdId}`)&&response.request().method()==='PUT');
 await page.getByPlaceholder('Nome del PNG',{exact:true}).fill('PNG modificato QA');
 await saved;
 await page.getByRole('button',{name:'Torna ai PNG',exact:true}).click();
 await page.getByText('PNG modificato QA',{exact:true}).waitFor();
 assert.equal(creates,2,'One failed attempt plus one explicit retry');
 assert.equal(updates,1,'Saved draft must update the canonical ID, not create another entity');
 assert.deepEqual({errors,unexpected,external},{errors:[],unexpected:[],external:[]});
 console.log('Original catalog Chromium contract passed: original tabs, no campaign required, failed draft retained, explicit retry and canonical-ID edit, no legacy requests.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
