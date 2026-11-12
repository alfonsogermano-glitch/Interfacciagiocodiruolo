import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {maskArubaTrashRow,maskArubaSessionNotesTrashHeader,maskArubaTrashItemPreview}
 from '../src/ArubaSafeNotesTransforms.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
test('original TrashRow loses ONLY irreversible purge controls',()=>{
 const source=readFileSync(resolve(root,'src/app/components/session/shared/TrashRow.tsx'),'utf8');
 const output=maskArubaTrashRow(source);
 assert.match(output,/aria-label="Ripristina"/);
 assert.match(output,/onClick=\{onRestore\}/);
 assert.doesNotMatch(output,/aria-label="Elimina definitivamente"/);
 assert.doesNotMatch(output,/onPurge\(\)/);
 assert.doesNotMatch(output,/Eliminare definitivamente\?/);
 assert.throws(()=>maskArubaTrashRow(source.replace('setConfirmPurge(true)','otherAction()')),
  /changed/);
});
test('original SessionNotesPanel keeps sections, resize and individual restore',()=>{
 const source=readFileSync(resolve(root,'src/app/components/session/SessionNotesPanel.tsx'),'utf8');
 const output=maskArubaSessionNotesTrashHeader(source);
 for(const feature of ['Note del GM','Note della Campagna','Cestino',
  'data-note-sidebar-resizer','trash.restoreNote','trash.restoreFolder',
  'TrashItemPreview','openSections.trash'])
  assert.ok(output.includes(feature),feature);
 assert.doesNotMatch(output,/onClick=\{trash.restoreAll\}/);
 assert.doesNotMatch(output,/onClick=\{\(\) => setConfirmEmptyTrash\(true\)\}/);
 assert.doesNotMatch(output,/trash.emptyTrash\(\)/);
 assert.throws(()=>maskArubaSessionNotesTrashHeader(source.replace(
  'openSections.trash && trash.count > 0 ? (',
  'changed condition ? (')), /changed/);
});

test('archived TipTap documents are never falsely described as empty',()=>{
 const source=readFileSync(resolve(root,'src/app/components/session/shared/TrashItemPreview.tsx'),'utf8');
 const result=maskArubaTrashItemPreview(source);
 assert.match(result,/il documento è conservato/);
 assert.doesNotMatch(result,/\(vuoto\)/);
 assert.match(result,/TrashItemPreview/);
 assert.throws(()=>maskArubaTrashItemPreview(source.replace('(vuoto)','(empty)')),/changed/);
});
