import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.mjs';

async function withServer(checkDatabase, fn) {
  const app = createApp({ checkDatabase });
  app.listen(0, '127.0.0.1');
  await once(app, 'listening');
  const base = 'http://127.0.0.1:' + app.address().port;
  try {
    await fn(base);
  } finally {
    await new Promise((resolve, reject) => app.close(error => error ? reject(error) : resolve()));
  }
}

test('health is public but reveals no credentials', async () => {
  await withServer(async () => {}, async base => {
    const response = await fetch(base + '/health');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { service: 'hollowgate-api', status: 'ok' });
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });
});

test('readiness only reports healthy when PostgreSQL check succeeds', async () => {
  await withServer(async () => {}, async base => {
    const response = await fetch(base + '/ready');
    assert.equal(response.status, 200);
    assert.equal((await response.json()).database, 'ready');
  });
});

test('readiness fails closed without leaking database errors', async () => {
  await withServer(async () => { throw new Error('secret credentials'); }, async base => {
    const response = await fetch(base + '/ready');
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { service: 'hollowgate-api', database: 'unavailable' });
  });
});

test('unimplemented application routes return 404', async () => {
  await withServer(async () => {}, async base => {
    const response = await fetch(base + '/auth/login');
    assert.equal(response.status, 404);
  });
});

test('mutating requests are rejected', async () => {
  await withServer(async () => {}, async base => {
    const response = await fetch(base + '/ready', { method: 'POST' });
    assert.equal(response.status, 405);
  });
});
