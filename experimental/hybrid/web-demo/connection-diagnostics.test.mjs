import test from 'node:test';
import assert from 'node:assert/strict';
import { connectionProblem,retryablePeerError } from './connection-diagnostics.mjs';
test('diagnostic distinguishes stalled ICE from room authorization',()=>{
 assert.match(connectionProblem('failed','failed'),/WebRTC fallito/);
 assert.match(connectionProblem('disconnected','disconnected'),/interrotto/);
 assert.match(connectionProblem('checking','connecting'),/verifica della connessione/);
 assert.equal(connectionProblem('connected','connected'),null);
});
test('transient network errors are distinguishable from missing rooms',()=>{
 assert.equal(retryablePeerError('webrtc'),true);
 assert.equal(retryablePeerError('network'),true);
 assert.equal(retryablePeerError('peer-unavailable'),false);
});
