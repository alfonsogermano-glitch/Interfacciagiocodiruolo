import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const config = JSON.parse(fs.readFileSync(new URL('vercel.json', root), 'utf8'));

assert.equal(config.git?.deploymentEnabled?.['tmp/**'], false, 'Temporary tmp/** branches must not trigger Vercel deployments');
assert.ok(Array.isArray(config.rewrites) && config.rewrites.some((rule) => rule.source === '/(.*)' && rule.destination === '/index.html'), 'SPA rewrite must remain configured');

console.log('Vercel preview policy verification passed: tmp/** branch deployments are disabled.');
