import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/ArubaGmLiveScene.jsx',import.meta.url),'utf8');
test('GM component closes transport and invalidates callbacks on campaign change or unmount',()=>{
 assert.match(source,/useEffect\(\(\)=>\(\)=>\{[\s\S]*?generation\.current\+\+;[\s\S]*?session\.current\?\.close\(\);[\s\S]*?\},\[campaign\.id\]\)/);
});
