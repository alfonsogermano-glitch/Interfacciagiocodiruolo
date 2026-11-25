import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {inventoryImages} from './image-recovery-inventory.mjs';
const bytes=Buffer.from('fixture');
const sha256=createHash('sha256').update(bytes).digest('hex');
const data={npcs:[{id:'npc',campaign_id:'campaign',portrait_image_url:'https://legacy/image'}]};
const manifest={items:[{sourceUrl:'https://legacy/image',path:'private/image',bytes:bytes.length,sha256,contentType:'image/png',publicPath:'/vtt/migrated-media/image'}]};
test('inventory verifies actual bytes without fetching old storage or exposing URLs',()=>{
 const before=structuredClone(data);
 const result=inventoryImages(data,manifest,()=>bytes);
 assert.equal(result.rows[0].status,'verified-file');
 assert.deepEqual(data,before);
 assert.equal(JSON.stringify(result).includes('https://legacy'),false);
});
test('bad checksums and absent files are never reported as recoverable',()=>{
 assert.equal(inventoryImages(data,manifest,()=>Buffer.from('bad')).rows[0].status,'integrity-error');
 assert.equal(inventoryImages(data,manifest,()=>{throw Error('missing');}).rows[0].status,'missing-file');
});
test('inline images are counted separately and never included in report',()=>{
 const inline='data:image/png;base64,'+bytes.toString('base64');
 const report=inventoryImages({monsters:[{id:'m',portrait_image_url:inline}]},{items:[]},()=>{throw Error();});
 assert.equal(report.rows[0].status,'verified-inline');
 assert.equal(JSON.stringify(report).includes('base64'),false);
});
