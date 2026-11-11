import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessAnswer } from './answer-guard.mjs';
test('accept answer only while local offer is pending', () => {
 assert.equal(assessAnswer('have-local-offer',null,'sdp-A'),'apply');
 assert.equal(assessAnswer('stable','sdp-A','sdp-A'),'duplicate');
 assert.equal(assessAnswer('stable','sdp-A','sdp-B'),'stale');
 assert.equal(assessAnswer('stable',null,'sdp-A'),'stale');
 assert.equal(assessAnswer('closed','sdp-A','sdp-A'),'stale');
});
