import test from 'node:test';
import assert from 'node:assert/strict';
import {withoutCharacterPortraitPresentation} from '../src/character-portrait-presentation.mjs';
test('authenticated portrait display data never enters normal sheet edits',()=>{
 const current={name:'PG',ambiti:{Fisico:2}};
 const next={...current,ambiti:{Fisico:1},portraitImageUrl:'data:image/jpeg;base64,private',
  portraitSourceImageUrl:undefined,portraitCropArea:null,coverImageUrl:'/vtt/native-cover'};
 const saved=withoutCharacterPortraitPresentation(next,current);
 assert.deepEqual(saved,{name:'PG',ambiti:{Fisico:1},coverImageUrl:'/vtt/native-cover'});
 assert.ok(Object.hasOwn(next,'portraitImageUrl'),'input is not mutated');
});
test('existing sheet field values and absence remain distinct',()=>{
 const current={portraitCropArea:null,portraitSourceImageUrl:'old-value'};
 assert.deepEqual(withoutCharacterPortraitPresentation({portraitImageUrl:'display',portraitCropArea:{x:1}},current),current);
});
