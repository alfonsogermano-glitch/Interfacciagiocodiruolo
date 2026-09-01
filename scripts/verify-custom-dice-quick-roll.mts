import assert from 'node:assert/strict';
import fs from 'node:fs';
import { expectedCustomDieFaceCount, isCustomDieFullyNumeric, validateCustomDieDefinition } from '../src/app/components/session/dice/diceCustomDie.ts';
import { addCustomQuickDie, addStandardQuickDie, buildQuickRollItems, clearQuickRoll } from '../src/app/components/session/dice/diceQuickRollState.ts';
import { rollDiceFormula } from '../src/app/components/session/dice/diceEngine.ts';
import type { SavedCustomDie } from '../src/app/components/session/dice/diceTypes.ts';

function read(path: string) { return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'); }
function symbolicDie(sides: 4|6|8|10|12|20): SavedCustomDie {
  return { id:`custom-${sides}`,campaignId:'c',ownerProfileId:'u',name:'Ferite',sides,
    faces:Array.from({length:sides},(_,i)=>({index:i+1,role:'single' as const,visual:{kind:'icon' as const,iconName:['Skull','Shield','Sword','Heart'][i%4]},label:['Skull','Shield','Sword','Heart'][i%4],numericValue:null})),
    bodyColor:'#20242f',symbolColor:'#ffffff',iconName:null,folderId:null,sortOrder:0,createdAt:'',updatedAt:'' };
}
assert.deepEqual([4,6,8,10,12,20,100].map((s)=>expectedCustomDieFaceCount(s as any)),[4,6,8,10,12,20,20]);
const d6=symbolicDie(6); assert.equal(validateCustomDieDefinition(d6).valid,true); assert.equal(isCustomDieFullyNumeric(d6),false);
assert.equal(validateCustomDieDefinition({...d6,faces:d6.faces.slice(0,5)}).valid,false);
let quick=[] as any[]; for(let i=0;i<5;i++) quick=addStandardQuickDie(quick,6); quick=addStandardQuickDie(quick,20); quick=addCustomQuickDie(quick,d6.id); quick=addCustomQuickDie(quick,d6.id);
assert.deepEqual(quick.map((e)=>e.quantity),[5,1,2]); assert.deepEqual(clearQuickRoll(),[]);
const resolved=buildQuickRollItems([{kind:'custom-die',customDieId:d6.id,quantity:5}], [d6]);
const rngValues=[1,1,2,3,4]; const result=rollDiceFormula({identity:{campaignId:'c',rollerId:'u',rollerName:'Tester'},request:{items:resolved,formulaName:'Tiro rapido',visibility:'public'}},()=>rngValues.shift()!);
assert.deepEqual(result.diceGroups[0].rolls.map((r)=>r.customFace?.label),['Skull','Skull','Shield','Sword','Heart']); assert.equal(result.total,null);
const d100:SavedCustomDie={...d6,id:'d100',name:'Percentile simbolico',sides:100,faces:[...Array.from({length:10},(_,i)=>({index:i+1,role:'tens' as const,visual:{kind:'icon' as const,iconName:'Skull'},label:`T${i+1}`,numericValue:null})),...Array.from({length:10},(_,i)=>({index:i+1,role:'units' as const,visual:{kind:'icon' as const,iconName:'Heart'},label:`U${i+1}`,numericValue:null}))]};
const d100Result=rollDiceFormula({identity:{campaignId:'c',rollerId:'u',rollerName:'Tester'},request:{items:buildQuickRollItems([{kind:'custom-die',customDieId:d100.id,quantity:1}],[d100]),formulaName:'d100',visibility:'public'}},((q=[4,7])=>()=>q.shift()!)());
assert.deepEqual(d100Result.diceGroups[0].rolls.map((r)=>r.physicalRole),['tens','units']); assert.deepEqual(d100Result.diceGroups[0].rolls.map((r)=>r.customFace?.label),['T4','U7']);

const types=read('src/app/components/session/dice/diceTypes.ts'); const floating=read('src/app/components/session/dice/DiceQuickRollFloating.tsx'); const toolbar=read('src/app/components/session/dice/DiceToolbar.tsx'); const session=read('src/app/components/session/dice/DiceSessionContext.tsx'); const configurator=read('src/app/components/session/dice/CustomDieConfigurator.tsx'); const materials=read('src/app/components/session/dice/dice3dCustomMaterials.ts'); const faceAssets=read('src/services/supabase/diceFaceAssetService.ts'); const iconData=read('src/app/components/session/shared/tiptapIconData.ts'); const tree=read('src/app/components/session/dice/DiceFormulaLibraryTree.tsx'); const panel=read('src/app/components/session/dice/SessionDicePanel.tsx'); const migration=read('supabase/migrations/20260831203000_custom_dice_and_library_nodes.sql'); const storageFix=read('supabase/migrations/20260901100500_dice_face_assets_storage_policy_fix.sql'); const realtime=read('src/services/realtime/diceRealtime.ts'); const relay=read('supabase/functions/dice-secret-roll/index.ts'); const projection=read('src/app/components/session/dice/dice3dProjection.ts'); const renderer=read('src/app/components/session/dice/dice3dRenderer.ts');
assert.ok(types.includes("'formula' | 'custom-die' | 'folder'"));
for(const hook of ['data-dice-quick-roll-floating','data-dice-quick-palette','data-dice-custom-toolbar','data-dice-history-unread']) assert.ok(floating.includes(hook),`missing ${hook}`);
assert.ok(floating.indexOf('SIDES.map') < floating.indexOf('data-dice-custom-toolbar'),'Custom ? must follow standard dice');
assert.ok(floating.includes("formulaName:'Tiro rapido'")); assert.ok(floating.includes('setEntries(clearQuickRoll())'),'successful quick roll must reset the pool');
assert.ok(floating.includes("const customEntries=entries.filter((entry): entry is Extract<QuickRollEntry,{kind:'custom-die'}>=>entry.kind==='custom-die')"),'quick roll summary must isolate custom dice');
assert.ok(floating.includes('{customEntries.length>0&&'),'custom summary must only render when custom dice are selected');
assert.ok(floating.includes('{customEntries.map((entry,i)=>'),'custom summary must render selected custom dice');
assert.ok(!floating.includes('{entries.length>0&&'),'standard dice must not create a separate selection summary');
assert.ok(!floating.includes('{entries.map((entry,i)=>'),'standard dice must not be rendered in the selection summary');
assert.ok(floating.includes('h-6 w-6 shrink-0 items-center justify-center rounded-full'),'dice history toggle must be 24px');
assert.ok(/data-dice-quick-palette className="[^"]*select-none[^"]*caret-transparent/.test(floating),'quick roll palette must hide the text caret and disable accidental text selection');
assert.ok(toolbar.includes('onClick={()=>onCreateCustomDie?.()}'),'Custom ? in dice screen must open the configurator directly');
assert.ok(!toolbar.includes('CustomDieSelector'),'dice screen Custom ? must not show the intermediate create question');
assert.ok(configurator.includes('p-4 caret-transparent" data-custom-die-configurator'),'custom configurator must hide caret outside editable inputs');
assert.ok((configurator.match(/\[caret-color:auto\]/g)??[]).length>=3,'editable custom die inputs must restore their text caret');
assert.ok(materials.includes('ICON_DATA[iconName]'),'custom 3D icon textures must use the selected Hollowgate icon geometry');
assert.ok(materials.includes('width="256" height="256" viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet"'),'custom icon SVG must use its canonical square geometry before safe-area placement');
assert.ok(iconData.includes('"Sword"'),'Sword must exist in the generated icon catalog');
assert.ok(iconData.includes('"points": "14.5 17.5 3 6 3 3 6 3 17.5 14.5"'),'Sword catalog geometry must preserve the Lucide sword shape');
assert.ok(materials.includes('const CUSTOM_FACE_STANDARD_CONTENT_RATIO = 0.52;'),'non-d4 custom art must use the approved larger centered safe area');
assert.ok(materials.includes('const CUSTOM_FACE_D4_CONTENT_RATIO = 0.9;'),'d4 must avoid double shrinking because dice-box-threejs already uses a special image placement path');
assert.ok(materials.includes('const drawableSize = CUSTOM_FACE_TEXTURE_SIZE * contentRatio;'),'custom face art must be fitted inside the explicit safe area');
assert.ok(materials.includes('const scale = Math.min(drawableSize / sourceWidth, drawableSize / sourceHeight);'),'custom face images must preserve aspect ratio while fitting inside the safe area');
assert.ok(materials.includes('const drawX = (CUSTOM_FACE_TEXTURE_SIZE - drawWidth) / 2;') && materials.includes('const drawY = (CUSTOM_FACE_TEXTURE_SIZE - drawHeight) / 2;'),'custom face images must be centered on both axes');
assert.ok(materials.includes('physicalSides === 4 ? CUSTOM_FACE_D4_CONTENT_RATIO : CUSTOM_FACE_STANDARD_CONTENT_RATIO'),'icons and uploaded images must use geometry-aware safe-area normalization');
assert.ok(faceAssets.includes('const scale = Math.min(TARGET_SIZE / bitmap.width, TARGET_SIZE / bitmap.height);'),'uploaded custom-die images must use contain scaling instead of square cropping');
assert.ok(faceAssets.includes('const dx = (TARGET_SIZE - drawWidth) / 2;') && faceAssets.includes('const dy = (TARGET_SIZE - drawHeight) / 2;'),'uploaded custom-die images must be centered during normalization');
assert.ok(faceAssets.includes('context.drawImage(bitmap, dx, dy, drawWidth, drawHeight);'),'uploaded custom-die images must preserve their whole visible area');
assert.ok(!faceAssets.includes('const side = Math.min(bitmap.width, bitmap.height);'),'custom-die upload must never crop the source to a square');
assert.ok(configurator.includes('data-custom-die-image-preview'),'uploaded-image preview must have a dedicated regression hook');
assert.ok(configurator.includes('className="h-full w-full object-contain p-0.5"'),'uploaded-image preview must contain and center the whole stored image');
assert.ok(!configurator.includes('h-full-w-full'),'uploaded-image preview must not use the invalid Tailwind size class');
assert.ok(configurator.includes("const hasIconFaces=faces.some(face=>face.visual.kind==='icon'); const hasImageFaces=faces.some(face=>face.visual.kind==='image');"),'custom configurator must track icon and uploaded-image faces separately');
assert.ok(configurator.includes('disabled={!hasIconFaces}'),'symbol color picker must disable only when every face is an uploaded image');
assert.ok(configurator.includes('Utilizzabile solo per le icone'),'mixed custom dice must explain that symbol color only affects icons');
assert.ok(materials.includes("const neutralTexture = { name: 'none', texture: null, bump: null, composite: 'source-over', material: 'none' };"),'custom dice must neutralize inherited theme textures');
assert.ok(materials.includes("typedFactory.dice_material = 'none';") && materials.includes("typedFactory.dice_material_rand = 'none';"),'custom dice must neutralize inherited theme materials');
assert.ok(materials.includes('typedFactory.material_options = { ...typedFactory.material_options, color: 0xffffff };'),'custom dice material must not tint the selected body color');
assert.ok(materials.includes('box.light?.color?.set?.(0xffffff);') && materials.includes('box.light_amb?.color?.set?.(0xffffff);'),'custom rolls must neutralize the upstream warm/yellow lights');
assert.ok(materials.includes('originalLighting.spot') && materials.includes('originalLighting.hemisphereSky'),'custom-roll lighting must be restored after the roll');
assert.ok(materials.includes('preset.normals = [];'),'custom 3D faces must disable stock numeric normal maps');
assert.ok(materials.includes('preset.normals = originalNormals;'),'custom 3D face normal maps must be restored after material creation');
assert.ok(session.includes('historyOpenRef')); assert.ok(session.includes('setHistoryUnread(true)')); assert.ok(!/revealRoll[\s\S]{0,500}setHistoryOpen\(true\)/.test(session),'revealRoll must not open history');
for(const hook of ['data-custom-die-configurator','data-custom-die-face','data-custom-die-upload']) assert.ok(configurator.includes(hook));
assert.ok(tree.includes("node.kind==='custom-die'")); assert.ok(panel.includes('setCustomDice(previousCustomDice)'));
assert.ok(migration.includes('public.dice_custom_dice')); assert.ok(migration.includes("'custom-die'::text")); assert.ok(migration.includes("'dice-face-assets'")); assert.ok(storageFix.includes('storage.foldername(storage.objects.name)'));
assert.ok(realtime.includes('isNullableFinite')); assert.ok(relay.includes('isNullableFinite'));
assert.ok(projection.includes('customMaterials')); assert.ok(projection.includes('face === 10 ? 100 : face * 10'));
assert.ok(renderer.includes('installCustomDiceMaterialAdapter')); assert.equal((renderer.match(/this\.box\.roll\(/g)??[]).length,1);
console.log('Custom dice and Quick Roll verification passed.');
