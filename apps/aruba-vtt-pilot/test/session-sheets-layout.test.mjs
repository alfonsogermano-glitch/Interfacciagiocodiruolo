import test from 'node:test';
import assert from 'node:assert/strict';
import {clampSheetsPanel,clampSheetsSidebar,readSheetsWidth} from '../src/session-sheets-layout.mjs';
test('sheet panel retains original desktop widths, viewport gap and minimum detail space',()=>{
 assert.equal(clampSheetsPanel(1024,1440),1024);
 assert.equal(clampSheetsPanel(2000,1440),1244);
 assert.equal(clampSheetsPanel(10,1440),640);
 assert.equal(clampSheetsSidebar(800,1024),664);
 assert.equal(clampSheetsSidebar(10,1024),192);
});
test('stored sheet width handles absent, malformed and blocked storage',()=>{
 assert.equal(readSheetsWidth({getItem:()=>null},'key',1024),1024);
 assert.equal(readSheetsWidth({getItem:()=>'-1'},'key',1024),-1);
 assert.equal(clampSheetsPanel(readSheetsWidth({getItem:()=>'-1'},'key',1024),1440),640);
 assert.equal(readSheetsWidth({getItem:()=>'NaN'},'key',1024),1024);
 assert.equal(readSheetsWidth(()=>{throw Error('blocked');},'key',1024),1024);
});
