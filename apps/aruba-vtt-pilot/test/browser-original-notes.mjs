// Browser-level QA of ORIGINAL SessionNotesPanel mounted in Aruba's real
// GM navigation. All API responses are isolated in-memory fixtures: this
// NEVER touches the production VPS, Supabase or real user accounts.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const base=process.env.HG_E2E_BASE??'http://127.0.0.1:4173';
const campaign='b0da2f75-f700-454c-9ba4-65bc0c8838ef';
const user='d4df2562-a83d-4d8d-92d4-e49b19c7810e';
const initialNote='fab34aae-beaf-4bca-9cce-9b497e114b94';
const secondNote='cf317f44-a915-4839-8cd6-9c8c2295599d';
const campaignRow={
 id:campaign,ownerId:user,name:'Campagna prova Note',description:'Solo browser test',
 ruleset:'hsc',createdAt:'2026-11-12T00:00:00.000Z',
};
const capability=enabled=>({
 backend:'aruba-staging',
 user:{id:user,email:'qa-notes@example.invalid',displayName:'GM di prova',role:'standard'},
 capabilities:{
  campaigns:{read:true,write:true},
  characters:{read:true,write:true},
  entityNotes:{read:false,write:false},
  campaignNotes:{read:true,write:true},
  campaignNoteFolders:{read:true,write:true},
  originalNotesPanel:{read:enabled,write:enabled},
  gameSession:false,
 },
});
const send=(route,status,body)=>route.fulfill({
 status,contentType:'application/json; charset=utf-8',
 headers:{'cache-control':'no-store'},body:JSON.stringify(body),
});
function mockApi(page,{enabled=true,authorized=true}={}){
 const store={notes:[],trash:[],requests:[],next:0};
 page.route('**/vtt/**',async route=>{
  const request=route.request(),url=new URL(request.url());
  const path=url.pathname,method=request.method();
  const body=request.postDataJSON?.()??{};
  store.requests.push({path,method,body});
  if(path==='/vtt/bootstrap')return send(route,authorized?200:401,
   authorized?capability(enabled):{error:'Non autenticato'});
  if(!authorized)return send(route,401,{error:'Non autenticato'});
  if(path==='/vtt/campaigns'&&method==='GET')
   return send(route,200,{campaigns:[campaignRow]});
  if(path==='/vtt/campaign-note-folders'&&method==='GET')
   return send(route,200,{folders:[]});
  if(path==='/vtt/campaign-notes/trash'&&method==='GET')
   return send(route,200,{notes:store.trash.map(note=>({
    id:note.id,tab_name:note.title,content:'',
    entity_type:note.parentId?'note':'campaign',hidden:note.scope==='gm',
    deleted_at:'2026-11-12T14:00:00.000Z',
   })),folders:[]});
  if(path==='/vtt/campaign-notes/trash/restore'&&method==='POST'){
   const index=store.trash.findIndex(n=>n.id===body.itemId);
   if(index<0)return send(route,404,{error:'Not found'});
   const [note]=store.trash.splice(index,1);
   store.notes.push({...note,visibility:'private'});
   return send(route,200,{restoredId:body.itemId,kind:body.kind});
  }
  if(path==='/vtt/campaign-notes'&&method==='GET'){
   const parentId=url.searchParams.get('parentId');
   return send(route,200,{notes:store.notes.filter(n=>n.parentId===(parentId??null))});
  }
  if(path==='/vtt/campaign-notes'&&method==='POST'){
   const parent=body.parentId?
    store.notes.find(n=>n.id===body.parentId):null;
   const id=store.next++===0?initialNote:secondNote;
   const note={id,title:body.title,parentId:body.parentId??null,
    scope:parent?.scope??body.scope??'shared',position:store.notes.length,
    visibility:parent?.visibility??(body.scope==='gm'?'private':'all'),
    contentRich:null,folderId:null,creatorId:user,editorOwnerId:user,
    titleIcon:null,tabOrder:null,updatedAt:'2026-11-12T15:00:00.000Z'};
   store.notes.push(note);
   return send(route,200,{note});
  }
  if(path.startsWith('/vtt/campaign-notes/')&&method==='PATCH'){
   const id=path.slice('/vtt/campaign-notes/'.length);
   const note=store.notes.find(n=>n.id===id);
   if(!note)return send(route,404,{error:'Not found'});
   note.title=body.title;
   note.contentRich=body.contentRich;
   note.position=body.position;
   note.visibility=body.visibility;
   return send(route,200,{savedId:id});
  }
  if(path.startsWith('/vtt/campaign-notes/')&&method==='DELETE'){
   const id=path.slice('/vtt/campaign-notes/'.length);
   const index=store.notes.findIndex(n=>n.id===id);
   if(index<0)return send(route,404,{error:'Not found'});
   store.trash.push(...store.notes.splice(index,1));
   return send(route,200,{archivedId:id});
  }
  return send(route,404,{error:'Unexpected browser fixture endpoint',path,method});
 });
 return store;
}
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const errors=[];
try{
 // Test a real unauthenticated browser, not only a bootstrap unit test.
 {
  const page=await browser.newPage();
  page.on('pageerror',e=>errors.push('unauthenticated '+e.message));
  mockApi(page,{authorized:false});
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.getByText('Il varco è chiuso').waitFor();
  assert.equal(await page.getByRole('button',{name:'Note',exact:true}).count(),0);
  await page.close();
 }
 // A valid account without the specific server capability must never see
 // the new right-side entry, even after selecting an owned campaign.
 {
  const page=await browser.newPage();
  page.on('pageerror',e=>errors.push('disabled '+e.message));
  mockApi(page,{enabled:false});
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Campagne',exact:true}).click();
  await page.getByRole('button',{name:'Apri campagna'}).click();
  assert.equal(await page.getByRole('button',{name:'Note',exact:true}).count(),0);
  assert.equal(await page.locator('[data-note-split-panel="true"]').count(),0);
  await page.close();
 }
 // The authenticated, explicitly enabled trial uses the REAL two-column
 // SessionNotesPanel, with original GM/shared sections and persisted Note.
 {
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',e=>errors.push('enabled '+e.message));
  const store=mockApi(page);
  await page.goto(base,{waitUntil:'domcontentloaded'});
  assert.equal(await page.getByRole('button',{name:'Note',exact:true}).count(),0,
   'No Note tab before a selected campaign');
  await page.getByRole('button',{name:'Campagne',exact:true}).click();
  await page.getByRole('button',{name:'Apri campagna'}).click();
  await page.getByRole('button',{name:'Note',exact:true}).click();
  await page.locator('[data-note-split-panel="true"]').waitFor();
  await page.getByRole('button',{name:/Note della Campagna/}).waitFor();
  await page.getByRole('button',{name:/Note del GM/}).waitFor();
  await page.getByRole('button',{name:/Cestino/}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Svuota cestino'}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Ripristina tutto'}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Elimina definitivamente'}).count(),0);

  const add=page.locator('[data-note-sidebar="true"] button[aria-label="Nuova nota"]');
  await add.last().click();
  await page.locator('[data-tab-id="'+initialNote+'"]').waitFor();
  assert.ok(store.requests.some(r=>r.method==='POST'&&r.path==='/vtt/campaign-notes'
   &&r.body.scope==='shared'), 'Creating original shared Note must call Aruba API');
  assert.equal(store.notes.length,1);
  // New notes are containers. Creating the first original subtab must use the
  // same campaign, real parent UUID and the Aruba session.
  await page.getByRole('button',{name:'Crea la prima sotto-tab'}).click();
  await page.locator('[data-tab-id="'+secondNote+'"]').waitFor();
  assert.ok(store.requests.some(r=>r.method==='POST'&&
   r.path==='/vtt/campaign-notes'&&r.body.parentId===initialNote),
   'Creating original NoteSubTabs must use the server parent ID');

  // RichTextEditor should render from the real component.
  await page.locator('[contenteditable="true"]').first().waitFor();
  await page.locator('[contenteditable="true"]').first().fill('Test TipTap Aruba');
  await page.waitForFunction(()=>false,{timeout:1}).catch(()=>{}); // no timers needed: observe network below
  await page.waitForTimeout(500);
  assert.ok(store.requests.some(r=>r.method==='PATCH'&&
   r.path==='/vtt/campaign-notes/'+secondNote&&
   JSON.stringify(r.body.contentRich??{}).includes('Test TipTap Aruba')),
   'Editor must persist a real TipTap JSON document via Aruba API');
  assert.equal(errors.length,0,'Browser runtime errors: '+errors.join('; '));
  await page.close();
 }
}finally{await browser.close();}
if(errors.length)throw Error('Browser console runtime errors: '+errors.join('; '));
console.log('Original Hollowgate Notes browser QA passed: auth gating, GM rail, split panel, root/subtab creation, TipTap save.');
