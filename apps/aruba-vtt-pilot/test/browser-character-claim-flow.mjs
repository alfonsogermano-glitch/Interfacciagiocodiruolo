import assert from 'node:assert/strict';
import {createServer} from 'node:https';
import {existsSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {extname,join,normalize} from 'node:path';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';

const gmId='11111111-1111-4111-8111-111111111111',playerId='22222222-2222-4222-8222-222222222222',rivalId='55555555-5555-4555-8555-555555555555';
const campaignId='33333333-3333-4333-8333-333333333333',characterId='44444444-4444-4444-8444-444444444444';
const gmToken='G'.repeat(43),playerToken='P'.repeat(43),rivalToken='R'.repeat(43),timestamp='2026-11-16T12:00:00.000Z';
const campaign={id:campaignId,ownerId:gmId,name:'Claim browser fixture',description:'Backend HTTP stateful senza PostgreSQL',ruleset:'hsc',createdAt:timestamp};
const sheet={style:'Jock',viaggio:'Campione',description:'PG reclamabile',ambiti:{Fisico:2,Scuola:1,Carisma:1,Strada:1},abilita:{},tratti:[],equipment:[],conditions:[],turbe:[],notes:''};
let character={id:characterId,campaignId,ownerId:gmId,name:'Mara Claim',sheetData:sheet,status:'active',createdAt:timestamp,updatedAt:timestamp};
let claimed=false,claimantId=null,saveCount=0,claimCount=0,claimAttempts=0,releaseCount=0;
const capabilities={campaigns:{read:true,write:true},characters:{read:true,write:true},campaignInvites:{read:false,write:false},chapters:{read:false,write:false},scenes:{read:false,write:false},narrativeContent:{read:false,write:false},equipmentCatalog:{read:false,write:false},campaignDocuments:{read:false,write:false},visualAssets:{read:false,write:false},campaignRoster:{read:true,write:false},characterAvailability:{read:true,write:true},characterAssignments:{read:true,write:true},playerCharacters:{read:true,write:false},characterClaims:{read:true,write:true},characterPortraits:{read:true,write:true},gameSession:false};
const dist=join(import.meta.dirname,'../../../deploy/aruba/dist/vtt-pilot'),temp=mkdtempSync(join(tmpdir(),'hg-claim-browser-'));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
let server,browser;
const json=(res,status,payload)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(payload));};
const body=req=>new Promise((resolve,reject)=>{const chunks=[];req.on('data',chunk=>chunks.push(chunk));req.on('end',()=>{try{resolve(chunks.length?JSON.parse(Buffer.concat(chunks).toString('utf8')):{});}catch(error){reject(error);}});req.on('error',reject);});
try{
 const openssl=process.env.HG_OPENSSL||['C:\\Program Files\\Git\\usr\\bin\\openssl.exe','C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe'].find(existsSync);
 if(!openssl)throw Error('OpenSSL unavailable');
 execFileSync(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(temp,'key.pem'),'-out',join(temp,'cert.pem'),'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{stdio:'ignore'});
 server=createServer({key:readFileSync(join(temp,'key.pem')),cert:readFileSync(join(temp,'cert.pem'))},async(req,res)=>{
  const url=new URL(req.url,'https://localhost'),path=url.pathname;
  const token=(req.headers.cookie?.match(/__Host-hg_session=([^;]+)/)||[])[1],role=token===gmToken?'gm':token===playerToken||token===rivalToken?'player':null,userId=token===gmToken?gmId:token===playerToken?playerId:rivalId;
  if(path.startsWith('/vtt/')&&!path.startsWith('/vtt/assets/')&&path!=='/vtt/'&&path!=='/vtt/index.html'){
   if(!role)return json(res,401,{error:'Non autenticato'});
   if(path==='/vtt/bootstrap')return json(res,200,{backend:'aruba-staging',user:{id:userId,email:userId+'@example.invalid',displayName:role==='gm'?'GM Browser':userId===playerId?'Player Browser':'Rival Browser',role:'standard'},capabilities});
   if(path==='/vtt/campaigns')return json(res,200,{campaigns:role==='gm'?[campaign]:[]});
   if(path==='/vtt/player-campaigns')return json(res,200,{campaigns:role==='player'?[campaign]:[]});
   if(path===`/vtt/campaigns/${campaignId}/roster`)return json(res,200,{members:[{userId:gmId,displayName:'GM Browser',role:'gm'},{userId:playerId,displayName:'Player Browser',role:'player'},{userId:rivalId,displayName:'Rival Browser',role:'player'}]});
   if(path==='/vtt/characters')return json(res,200,{characters:role==='gm'?[character]:[]});
   if(path==='/vtt/character-availability')return json(res,200,{characters:[{id:characterId,availableForPlayers:true}]});
   if(path==='/vtt/character-assignments')return json(res,200,{assignments:claimed?[{characterId,playerId:claimantId}]:[]});
   if(path==='/vtt/owned-character-claims')return json(res,200,{claims:role==='gm'&&claimed?[{characterId,playerId:claimantId,claimedAt:timestamp}]:[]});
   if(path==='/vtt/player-character-claims')return json(res,200,{characters:role==='player'&&!claimed?[character]:[]});
   if(path==='/vtt/player-character-claim')return json(res,200,{claim:role==='player'&&claimantId===userId?{characterId,claimedAt:timestamp}:null});
   if(path==='/vtt/player-characters'&&req.method==='GET')return json(res,200,{characters:role==='player'&&claimantId===userId?[character]:[]});
   if(path===`/vtt/player-characters/${characterId}/claim`&&req.method==='POST'){claimAttempts++;if(claimed)return json(res,409,{error:'Personaggio non disponibile'});claimed=true;claimantId=userId;claimCount++;return json(res,200,{characterId,campaignId});}
   if(path===`/vtt/player-characters/${characterId}/release`&&req.method==='POST'){if(claimantId!==userId)return json(res,409,{error:'Personaggio non posseduto'});claimed=false;claimantId=null;releaseCount++;return json(res,200,{characterId,campaignId});}
   if(path===`/vtt/player-characters/${characterId}`&&req.method==='PUT'){
    const payload=await body(req);if(role!=='player'||claimantId!==userId)return json(res,404,{error:'Claim non valido'});
    character={...character,name:payload.name,sheetData:payload.sheetData,updatedAt:new Date().toISOString()};saveCount++;return json(res,200,{character});
   }
   if(path.startsWith('/vtt/character-portrait/'))return json(res,404,{error:'Fixture senza binary ritratto'});
   return json(res,404,{error:'Endpoint non previsto '+path});
  }
  let relative=path.replace(/^\/vtt\/?/,'');if(!relative||relative==='index.html')relative='index.html';const file=normalize(join(dist,relative));
  if(file.startsWith(normalize(dist))&&existsSync(file)){res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream','cache-control':'no-store'});return res.end(readFileSync(file));}
  res.writeHead(302,{location:'/vtt/'});res.end();
 });
 server.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const origin=`https://127.0.0.1:${server.address().port}`,base=origin+'/vtt/';
 const executable=process.env.HG_BROWSER_EXECUTABLE||join(process.env.LOCALAPPDATA||'','ms-playwright','chromium-1228','chrome-win64','chrome.exe');
 browser=await chromium.launch({headless:true,executablePath:executable,args:['--no-sandbox','--ignore-certificate-errors','--allow-insecure-localhost','--no-proxy-server']});
 const gmContext=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:900}}),playerContext=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:390,height:844}}),rivalContext=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:390,height:844}});
 await gmContext.addCookies([{name:'__Host-hg_session',value:gmToken,url:origin}]);await playerContext.addCookies([{name:'__Host-hg_session',value:playerToken,url:origin}]);await rivalContext.addCookies([{name:'__Host-hg_session',value:rivalToken,url:origin}]);
 const gm=await gmContext.newPage(),player=await playerContext.newPage(),rival=await rivalContext.newPage(),errors=[];gm.on('pageerror',e=>errors.push('gm:'+e.message));player.on('pageerror',e=>errors.push('player:'+e.message));rival.on('pageerror',e=>errors.push('rival:'+e.message));
 await Promise.all([gm.goto(base,{waitUntil:'domcontentloaded'}),player.goto(base,{waitUntil:'domcontentloaded'}),rival.goto(base,{waitUntil:'domcontentloaded'})]);
 const enter=async(page)=>{await page.getByRole('button',{name:'Campagne',exact:true}).click();await page.getByRole('button',{name:/Claim browser fixture[\s\S]*Creata il/}).click();await page.getByRole('button',{name:'Entra nella campagna'}).click();await page.locator('[data-aruba-campaign-home]').waitFor();};
 await Promise.all([enter(gm),enter(player),enter(rival)]);
 const playerHome=player.locator('[data-aruba-campaign-home]');await playerHome.getByRole('button',{name:'Precompilati'}).click();await playerHome.getByRole('button',{name:'Richiedi'}).click();await playerHome.getByRole('button',{name:'Personaggi'}).click();await playerHome.getByText('Mara Claim',{exact:true}).waitFor();assert.equal(claimCount,1);
 await gm.getByRole('button',{name:'Campagne',exact:true}).click();await gm.getByRole('button',{name:'Schede',exact:true}).click();await gm.getByText('Reclamato dal giocatore · gestione assegnazione bloccata',{exact:true}).waitFor();assert.equal(await gm.locator('[data-campaign-member-id="'+playerId+'"] [data-campaign-character-id="'+characterId+'"]').count(),1);
 await player.getByLabel('Personaggi',{exact:true}).click();const panel=player.getByRole('region',{name:'I miei personaggi assegnati'});await panel.getByText('Mara Claim',{exact:true}).click();
 const detail=player.getByRole('region',{name:'Scheda di Mara Claim'});const nameInput=detail.locator('input[type="text"]').first();assert.equal(await nameInput.isDisabled(),false);await nameInput.fill('Mara Modificata');await player.waitForFunction(()=>document.body.innerText.includes('Scheda salvata')||!document.body.innerText.includes('Salvataggio scheda su Aruba'));
 await player.getByRole('button',{name:'Torna ai personaggi'}).click();await panel.getByRole('button',{name:'Rilascia al GM'}).click();await panel.getByText('Nessun personaggio assegnato in questa campagna.').waitFor();assert.equal(saveCount>0,true);assert.equal(releaseCount,1);
 await gm.getByRole('button',{name:'Campagne',exact:true}).click();await gm.getByRole('button',{name:/Claim browser fixture[\s\S]*Creata il/}).click();await gm.getByRole('button',{name:'Entra nella campagna'}).click();await gm.getByRole('button',{name:'Campagne',exact:true}).click();await gm.getByRole('button',{name:'Schede',exact:true}).click();await gm.getByText('Mara Modificata',{exact:true}).waitFor();assert.equal(await gm.getByText('Reclamato dal giocatore · gestione assegnazione bloccata',{exact:true}).count(),0);
 await player.getByRole('button',{name:'Campagne',exact:true}).click();await player.getByRole('button',{name:/Claim browser fixture[\s\S]*Creata il/}).click();await player.getByRole('button',{name:'Entra nella campagna'}).click();await player.locator('[data-aruba-campaign-home]').waitFor();
 const openPremades=async page=>{const home=page.locator('[data-aruba-campaign-home]');await home.getByRole('button',{name:'Precompilati'}).click();await home.getByRole('button',{name:'Richiedi'}).waitFor();return home;};
 const [playerRaceHome,rivalRaceHome]=await Promise.all([openPremades(player),openPremades(rival)]),attemptsBefore=claimAttempts;
 await Promise.all([playerRaceHome.getByRole('button',{name:'Richiedi'}).click(),rivalRaceHome.getByRole('button',{name:'Richiedi'}).click()]);
 await Promise.all([player.waitForTimeout(250),rival.waitForTimeout(250)]);assert.equal(claimAttempts-attemptsBefore,2);assert.equal(claimCount,2,'exactly one additional winner expected');assert.ok([playerId,rivalId].includes(claimantId));
 const loser=claimantId===playerId?rival:player;await loser.getByRole('alert').filter({hasText:'Personaggio non più disponibile'}).waitFor();
 assert.deepEqual(errors,[]);console.log('BROWSER_CHARACTER_CLAIM_FLOW_SUCCESS: isolated GM/two-player cookies, claim, GM grouping, claimed edit, release, GM restore, exactly-one HTTP race winner (stateful fixture; no PostgreSQL).');
 await Promise.all([gmContext.close(),playerContext.close(),rivalContext.close()]);
}finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));rmSync(temp,{recursive:true,force:true});}
