import test from 'node:test';
import assert from 'node:assert/strict';
import { retryDelay,canRetry } from './reconnect-policy.mjs';
test('bounded exponential retry backs off and stops after six attempts',()=>{
 assert.deepEqual([1,2,3,4,5,6,7].map(retryDelay),[1000,2000,4000,8000,10000,10000,null]);
});
test('explicit disconnect and successful connection disable retries',()=>{
 assert.equal(canRetry({requested:false,connected:false,attempt:1}),false);
 assert.equal(canRetry({requested:true,connected:true,attempt:1}),false);
 assert.equal(canRetry({requested:true,connected:false,attempt:7}),false);
 assert.equal(canRetry({requested:true,connected:false,attempt:4}),true);
});
