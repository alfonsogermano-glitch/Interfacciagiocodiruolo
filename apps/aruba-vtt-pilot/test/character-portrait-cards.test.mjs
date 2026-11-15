import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
test('original card is reused with a current authorized portrait, no stale image URLs',()=>{
 const source=read('ArubaPortraitEntityCard.tsx');
 assert.match(source,/readCharacterPortrait\(fetch,campaignId,characterId\)/);
 assert.match(source,/return <EntityCard/);
 assert.match(source,/photoUrl=\{photo\}/);
 assert.match(source,/photoSourceUrl=\{null\}/);
 assert.match(source,/setPhoto\(null\)/);
 assert.doesNotMatch(source,/saveFullCharacterSheet|saveCharacterPortrait|supabase\.storage/);
 for(const name of ['ArubaCharacterDrafts.tsx','ArubaCampaignCharacterCards.tsx','ArubaCampaignPlayerRows.tsx']){
  const text=read(name);
  assert.match(text,/<ArubaPortraitEntityCard/);
  assert.match(text,/enabled=\{portraitsEnabled\}/);
 }
});
test('GM sheet image and token use only in-memory Aruba portrait and original detail component',()=>{
 const sheet=read('ArubaCharacterDetailPanel.tsx');
 const editor=read('ArubaGMCharacterPortrait.tsx');
 assert.match(sheet,/readCharacterPortrait\(fetch,campaignId,draft\.id\)/);
 assert.match(sheet,/portraitImageUrl:portrait\?\?undefined,portraitSourceImageUrl:undefined,portraitCropArea:null/);
 assert.match(sheet,/onSaved=\{setPortrait\}/);
 assert.match(editor,/onUploaded=\{\(url,extra\)=>\{setPreview\(url\)/);
 assert.match(editor,/if\(extra\?\.sourceUrl\)setSource\(extra.sourceUrl\)/);
 assert.match(editor,/onSaved\?\.\(url\)/);
 assert.match(sheet,/<EntityDetailView/);
});
