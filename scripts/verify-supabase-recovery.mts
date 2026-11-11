import test from 'node:test';
import assert from 'node:assert/strict';
import { probeLegacyBackend } from '../src/app/recovery/recoveryProbe.ts';
const base = 'https://example.supabase.co';
const ok = async () => ({ ok: true });
test('healthy auth and REST can load the existing login app', async () => {
 assert.equal(await probeLegacyBackend(base,'public-test-key',ok),'available');
});
test('healthy auth with exhausted REST quota enters Supabase-free recovery', async () => {
 const calls=[];
 const fetcher=async (url) => {
  calls.push(String(url));
  return { ok: !String(url).includes('/rest/v1/') };
 };
 assert.equal(await probeLegacyBackend(base,'public-test-key',fetcher),'unavailable');
 assert.equal(calls.length,2);
});
test('backend network failure enters recovery rather than crashing',async()=>{
 assert.equal(await probeLegacyBackend(base,'public-test-key',async()=>{throw Error('network offline')}),'unavailable');
});
test('rejects unsafe service URL and missing publishable key',async()=>{
 assert.equal(await probeLegacyBackend('http://example.org','public-test-key',ok),'unavailable');
 assert.equal(await probeLegacyBackend(base,'',ok),'unavailable');
});
