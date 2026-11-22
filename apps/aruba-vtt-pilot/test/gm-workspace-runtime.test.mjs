import test from 'node:test';import assert from 'node:assert/strict';
import {getGmWorkspaceRuntime,installGmWorkspaceRuntime} from '../src/ArubaGmWorkspaceRuntime.mjs';
const campaign='00000000-0000-4000-8000-000000000001';
const runtime={getCurrentMapContext:()=>({chapterId:'c',state:{}}),onTokenAction(){},onPoiAction(){},onLayerAction(){}};
test('authoritative workspace runtime has unique campaign ownership and revocable live getters',()=>{
 const handle=installGmWorkspaceRuntime(campaign,runtime);assert.equal(getGmWorkspaceRuntime(campaign),runtime);
 assert.throws(()=>installGmWorkspaceRuntime(campaign,runtime),/Unique authoritative/);
 handle.close();assert.equal(getGmWorkspaceRuntime(campaign),null);
});
test('workspace adapter exposes only original handler refs and current-state getter',async()=>{
 const {readFile}=await import('node:fs/promises');
 const source=await readFile(new URL('../src/ArubaOriginalSessionWorkspace.tsx',import.meta.url),'utf8');
 const original=await readFile(new URL('../../../src/app/components/session/SessionWorkspace.tsx',import.meta.url),'utf8');
 assert.match(source,/onAuthoritativeMapRuntime=\{register\}/);
 assert.match(original,/authoritativeDisplayRef\.current = display/);
 assert.match(original,/playerMapActionHandlerRef\.current\(payload\)/);
 assert.doesNotMatch(source,/useReducer|setMapTokens|setMapPois/);
});
