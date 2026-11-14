import test from 'node:test';
import assert from 'node:assert/strict';
import {createArubaEntityNote,listArubaEntityNotes} from '../src/ArubaCampaignNotesEndpoints.mjs';
const campaign='b0da2f75-f700-454c-9ba4-65bc0c8838ef';
const user='d4df2562-a83d-4d8d-92d4-e49b19c7810e';
const id='fab34aae-beaf-4bca-9cce-9b497e114b94';
const reply=body=>({ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>body});
test('created Note uses same original UI contract as a reloaded Note and retains campaign identity',async()=>{
 const note={id,title:'Nuova nota',parentId:null,scope:'shared',position:0,
  visibility:'all',contentRich:null,folderId:null,creatorId:user,
  editorOwnerId:user,titleIcon:null,tabOrder:null,updatedAt:null};
 const requests=[];
 const fetcher=async(path,options)=>{
  requests.push({path,options});
  return path.includes('?')?reply({notes:[note]}):reply({note});
 };
 const created=await createArubaEntityNote(fetcher,campaign,campaign,'Nuova nota',null,'shared');
 const [loaded]=await listArubaEntityNotes(fetcher,campaign,campaign);
 assert.deepEqual(created,loaded,'Create and GET must use the same original NoteListRow shape');
 assert.equal(created.campaign_id,campaign);
 assert.equal(created.owner_profile_id,user);
 assert.equal(created.hidden,false);
 assert.equal(JSON.parse(requests[0].options.body).scope,'shared');
});
