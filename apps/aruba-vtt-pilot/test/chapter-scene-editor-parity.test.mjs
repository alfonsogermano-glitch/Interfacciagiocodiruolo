import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const editor=readFileSync(new URL('../src/ArubaChapterSceneEditor.tsx',import.meta.url),'utf8');
const original=readFileSync(new URL('../../../src/app/components/gm/ChapterScenesEditor.tsx',import.meta.url),'utf8');
const pilot=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8');

test('renders the original Chapter map overview semantics for Scene regions',()=>{
 for(const contract of ['viewBox="0 0 100 100"','preserveAspectRatio="none"','<rect','<polygon','fillOpacity','vectorEffect="non-scaling-stroke"']){
  assert.ok(original.includes(contract),`original contract missing ${contract}`);
  assert.ok(editor.includes(contract),`Aruba contract missing ${contract}`);
 }
 assert.match(editor,/chapter\.mapMetadata\.previewUrl\?\?chapter\.mapUrl/);
 assert.match(editor,/grid\.gridVisible/);
});

test('limits Scene branches to the selected Chapter exactly like the original editor',()=>{
 assert.match(original,/chapterScenes\.filter\(scene => scene\.id !== draft\.id\)/);
 assert.match(editor,/scenes\.filter\(s=>s\.id!==draftScene\.id\)/);
 assert.doesNotMatch(editor,/\(graph\?\.scenes\?\?\[\]\)\.filter\(s=>s\.id!==draftScene\.id\)/);
});

test('keeps the original Chapter and Scene panel order while unsupported content stays gated',()=>{
 for(const label of ['Panoramica','Mappa','Contenuti','Scene','Diramazioni'])assert.ok(editor.includes(`'${label}'`));
 for(const label of ['Dettagli','Mappa','Contenuti','Diramazioni'])assert.ok(editor.includes(`'${label}'`));
 assert.match(editor,/\['content','Contenuti',Boxes,!contentEnabled\]/);
 assert.match(editor,/ArubaNarrativeScopeContent/);
 assert.match(editor,/role="tablist" aria-label="Sezioni capitolo"/);
 assert.match(editor,/role="tablist" aria-label="Sezioni scena"/);
});

test('matches original explicit view edit save cancel lifecycle for Chapters and Scenes',()=>{
 for(const label of ['Modifica Capitolo','Salva modifiche Capitolo','Annulla modifiche Capitolo','Modifica Scena','Salva modifiche Scena','Annulla modifiche Scena']){
  assert.ok(editor.includes(`aria-label="${label}"`),`missing ${label}`);
 }
 assert.match(editor,/disabled=\{!chapterEditing\}/);
 assert.match(editor,/disabled=\{!sceneEditing\}/);
 assert.match(editor,/setChapterEditing\(false\)/);
 assert.match(editor,/setSceneEditing\(false\)/);
 assert.match(editor,/disabled=\{busy\|\|!chapterDirty/);
 assert.match(editor,/disabled=\{busy\|\|!sceneDirty/);
 assert.match(editor,/changeChapterPanel\(id\)/);
 assert.match(editor,/changeScenePanel\(id\)/);
});

test('accepts real HTTPS map URLs and rejects legacy or insecure transports',()=>{
 const line=editor.split('\n').find(item=>item.includes('const validMediaUrl='));
 assert.ok(line,'validMediaUrl contract missing');
 const expression=line.slice(line.indexOf('=>')+2).replace(/;\s*$/,'');
 const validMediaUrl=new Function('url',`return (${expression})`);
 assert.equal(validMediaUrl('https://aruba-test.invalid/test-map.png'),true);
 assert.equal(validMediaUrl('https://cdn.example.invalid/maps/atrio.webp'),true);
 assert.equal(validMediaUrl('http://aruba-test.invalid/test-map.png'),false);
 assert.equal(validMediaUrl('https://legacy.supabase.co/map.png'),false);
 assert.equal(validMediaUrl(''),true);
});

test('mounts the Chapter and Scene editor from the real pilot navigation',()=>{
 assert.match(pilot,/section==='chapters'&&activeCampaign&&\s*<ArubaChapterSceneEditor/);
 assert.match(pilot,/enabled=\{user\.chaptersEnabled&&user\.scenesEnabled\}/);
 assert.match(pilot,/type Section='home'\|'campaigns'\|'characters'\|'session'\|'chapters'\|'preparation'\|'sheets'\|'npcs'\|'monsters'\|'clues'\|'equipment'\|'map'\|'situations'\|'phases'\|'combat'\|'assets';/);
});
