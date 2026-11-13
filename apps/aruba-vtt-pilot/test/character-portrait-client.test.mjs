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
 const panel=readFileSync(new URL('../src/ArubaCharacterDetailPanel.tsx',import.meta.url),'utf8');
 assert.match(panel,/arubaPortraitEditor=\{portraitsEnabled\?/);
 assert.match(panel,/<ArubaGMCharacterPortrait/);
 assert.doesNotMatch(panel,/section==='immagine'/);
});

test('GM original image source is stored separately from its cropped JPEG',async()=>{
 const original=readFileSync(new URL('../../../src/app/components/shared/ImageCropCore.tsx',import.meta.url),'utf8');
 const media=readFileSync(new URL('../src/ArubaGMCharacterPortrait.tsx',import.meta.url),'utf8');
 assert.match(original,/selectedFile && preserveSource && uploadSource/);
 assert.match(original,/uploadSource\(sourceBlob\)/);
 assert.match(media,/readCharacterPortraitSource\(fetch,campaignId,characterId\)/);
 assert.match(media,/existingImageUrl=\{source\?\?preview\?\?undefined\}/);
 assert.match(media,/preserveSource/);
 assert.match(media,/uploadSource=\{blob=>saveCharacterPortraitSource/);
 assert.match(media,/onUploaded=\{\(url,extra\)=>/);
});
test('source client enforces GM-only endpoint and upload size',async()=>{
 const {readCharacterPortraitSource,saveCharacterPortraitSource}=await import('../src/client.mjs');
 const sourceBlob=new Blob([jpeg],{type:'image/jpeg'});let saved;
 await saveCharacterPortraitSource(async(url,options)=>{
  saved={url,options};
  return {ok:true,json:async()=>({characterId:character,stored:true})};
 },campaign,character,sourceBlob);
 assert.equal(saved.url,'/vtt/character-portrait-source/'+character+'?campaignId='+campaign);
 assert.equal(saved.options.method,'PUT');
 const read=await readCharacterPortraitSource(async()=>({
  ok:true,json:async()=>({characterId:character,mimeType:'image/jpeg',
   dataBase64:Buffer.from(jpeg).toString('base64')})
 }),campaign,character);
 assert.ok(read.startsWith('data:image/jpeg;base64,'));
 await assert.rejects(()=>saveCharacterPortraitSource(async()=>{throw Error('should not send')},
  campaign,character,new Blob([new Uint8Array(2097153)],{type:'image/jpeg'})));
});
