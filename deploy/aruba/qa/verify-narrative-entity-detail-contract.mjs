import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const load=p=>readFileSync(path.join(root,p),'utf8');
const contract=JSON.parse(load('deploy/aruba/qa/narrative-entity-detail-contract.json'));
const npc=load(contract.source.npc),monster=load(contract.source.monster);
const view=load(contract.source.arubaView),validation=load(contract.source.arubaValidation),entityView=load(contract.source.view);
const failures=[];
const assert=(value,message)=>{if(!value)failures.push(message);};
assert(contract.status==='verified','Narrative detail write status changed without review');
assert(contract.activationPolicy.allowWrite===true,'Narrative detail writer is not documented');
assert(contract.blockedWriteBoundaries.length===5,'Narrative write blocker inventory changed without review');
assert(contract.blockedWriteBoundaries.find(item=>item.id==='semantic-field-validation')?.state==='browser-postgres-http-verified',
 'Narrative semantic validation evidence state changed without review');
assert(contract.blockedWriteBoundaries.find(item=>item.id==='chapter-scene-placement')?.state==='browser-postgres-http-verified',
 'Narrative Chapter/Scene placement evidence state changed without review');
for(const id of ['binary-images','referenced-visual-assets'])
 assert(contract.blockedWriteBoundaries.find(item=>item.id===id)?.state==='browser-postgres-http-verified',
  `Narrative media evidence state changed without review: ${id}`);
assert(contract.blockedWriteBoundaries.find(item=>item.id==='custom-entity-notes')?.state==='browser-postgres-http-verified',
 'Narrative custom-note backend evidence state changed without review');
assert(JSON.stringify(contract.failClosedReferences?.fields)===JSON.stringify(['environmentId','mapLocationId','folderId']),
 'Narrative fail-closed placement references changed without review');
assert(/Collocazione non ancora supportata su Aruba/.test(validation)&&/disabled=\{arubaIsolatedNarrative\}/.test(entityView)&&
 /I luoghi non hanno ancora un archivio Aruba/.test(entityView),
 'Narrative unsupported placement must remain rejected and visibly disabled');
assert(/saveArubaNarrativeContent/.test(view)&&/saveQueue\.current=saveQueue\.current/.test(view)&&
 /if\(saveError\.current!==null\)return/.test(view)&&/awaitArubaNoteWrites\(campaignId,entityId\)/.test(view)&&/arubaIsolatedNarrative/.test(view),
 'Aruba narrative detail lacks serialized fail-closed persistence');
assert(/JSON\.stringify\(draft\)\.length>100000/.test(validation),'Narrative JSON bound missing');
assert(/supabase/.test(validation),'Legacy asset rejection missing');
for(const marker of ['validateOriginalEntityFields','validateArubaNarrativeMedia','d20Stats','customEntries','DIFFICULTIES'])
 assert(validation.includes(marker),`Narrative semantic validator missing: ${marker}`);
for(const field of contract.payloadRoundTrip.npcFields)
 assert(new RegExp(`\\b${field}\\b`).test(npc),`NPC source field missing: ${field}`);
for(const field of contract.payloadRoundTrip.monsterFields)
 assert(new RegExp(`\\b${field}\\b`).test(monster),`Monster source field missing: ${field}`);
const blocked=new Set(contract.blockedWriteBoundaries.flatMap(item=>item.fields));
for(const field of ['portraitImageUrl','portraitSourceImageUrl','coverImageUrl'])
 assert(blocked.has(field),`Untracked narrative media blocker: ${field}`);
const unresolved=contract.blockedWriteBoundaries.filter(item=>item.state!=='browser-postgres-http-verified').length;
assert(unresolved===0,`Narrative write boundaries still unverified: ${unresolved}`);
if(failures.length){console.error(`NARRATIVE ENTITY DETAIL CONTRACT FAILED: ${failures.length}`);for(const failure of failures)console.error(' - '+failure);process.exit(1);}
console.log(`NARRATIVE ENTITY DETAIL CONTRACT VERIFIED: ${contract.payloadRoundTrip.npcFields.length} NPC + ${contract.payloadRoundTrip.monsterFields.length} monster fields; 5 write boundaries browser+PostgreSQL verified; ${contract.failClosedReferences.fields.length} unsupported references fail-closed.`);
