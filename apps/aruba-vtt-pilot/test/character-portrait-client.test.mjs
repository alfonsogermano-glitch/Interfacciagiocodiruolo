import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readCharacterPortrait,saveCharacterPortrait,validateBootstrap} from '../src/client.mjs';
const campaign='be2f1a87-b8ee-4b34-9da0-07efda11379a';
const character='ee2f1a87-b8ee-4b34-9da0-07efda11379a';
const jpeg=new Uint8Array([255,216,255,224,0,16,74,70,73,70,0,1,255,217]);
test('GM original editor saves cropped jpeg through Aruba cookie, not legacy storage',async()=>{
 let call;
 const blob=new Blob([jpeg],{type:'image/jpeg'});
 const result=await saveCharacterPortrait(async(url,options)=>{
  call={url,options};return {ok:true,json:async()=>({stored:true,characterId:character})};
 },campaign,character,blob);
 assert.ok(result.publicUrl.startsWith('data:image/jpeg;base64,'));
 assert.equal(call.url,'/vtt/character-portrait/'+character+'?campaignId='+campaign);
 assert.equal(call.options.method,'PUT');
 assert.equal(call.options.credentials,'same-origin');
 assert.equal(JSON.parse(call.options.body).dataBase64,Buffer.from(jpeg).toString('base64'));
 const media=readFileSync(new URL('../src/ArubaGMCharacterPortrait.tsx',import.meta.url),'utf8');
 assert.match(media,/<ImageCropCore/);
 assert.match(media,/uploadCropped=\{blob=>saveCharacterPortrait/);
 assert.doesNotMatch(media,/supabase|saveImageAssetSource|ImageAssetPicker/);
});
test('player/GM portrait read is an authenticated GET and a memory-only preview',async()=>{
 const base64=Buffer.from(jpeg).toString('base64');let options;
 const url=await readCharacterPortrait(async(path,opts)=>{
  options=opts;return {ok:true,json:async()=>({characterId:character,mimeType:'image/jpeg',dataBase64:base64})};
 },campaign,character);
 assert.equal(url,'data:image/jpeg;base64,'+base64);
 assert.equal(options.method,'GET');
 assert.equal(options.cache,'no-store');
 assert.equal(await readCharacterPortrait(async()=>({status:404}),campaign,character),null);
});
test('size, mime and ids reject before any binary transmission',async()=>{
 let calls=0;const f=async()=>{calls++;return {ok:true}};
 await assert.rejects(()=>saveCharacterPortrait(f,campaign,character,new Blob([jpeg],{type:'image/svg+xml'})));
 await assert.rejects(()=>saveCharacterPortrait(f,campaign,character,new Blob([new Uint8Array(524289)],{type:'image/jpeg'})));
 await assert.rejects(()=>readCharacterPortrait(f,'forged',character));
 assert.equal(calls,0);
});
test('portrait capability checks explicit dependencies and the original cropper retains legacy transport by default',()=>{
 const source=readFileSync(new URL('../../../src/app/components/shared/ImageCropCore.tsx',import.meta.url),'utf8');
 assert.match(source,/uploadCropped \? await uploadCropped\(blob\) : await uploadContentAsset/);
 assert.match(source,/selectedFile && preserveSource && !uploadCropped/);
 assert.match(readFileSync(new URL('../src/ArubaCharacterDetailPanel.tsx',import.meta.url),'utf8'),/portraitsEnabled\?<ArubaGMCharacterPortrait/);
});
