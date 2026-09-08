import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const data = fs.readFileSync(new URL('src/app/components/session/dice/fireFrameAtlasData.ts', root), 'utf8');
const overlay = fs.readFileSync(new URL('src/app/components/session/dice/DiceFireAnimatedOverlay.tsx', root), 'utf8');
const css = fs.readFileSync(new URL('src/app/components/session/dice/diceFireAnimation.css', root), 'utf8');
const boost = fs.readFileSync(new URL('src/app/components/session/dice/dice3dVisualBoost.ts', root), 'utf8');

assert.ok(data.includes('FIRE_FRAME_COUNT = 10'), 'Fire animation must expose exactly 10 supplied frames');
assert.ok(data.includes('FIRE_FRAME_PING_PONG_SEQUENCE'), 'Fire animation must document the ping-pong sequence');
assert.ok(data.includes('[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 8, 7, 6, 5, 4, 3, 2, 1]'), 'Fire ping-pong order must be 1..10..2 before repeating frame 1');
assert.ok(data.includes('FIRE_FRAME_ATLAS_DATA_URL'), 'Fire animation must expose the shared frame atlas');
assert.ok(overlay.includes('FIRE_FRAME_ATLAS_DATA_URL'), '2D Fire previews must use the frame atlas over the colored Fire base texture');
assert.ok(overlay.includes('data-dice-fire-frame-sequence'), '2D Fire previews must render the frame sequence layer');
assert.ok(css.includes('@keyframes hollowgate-fire-frame-loop'), '2D Fire must define the supplied-frame ping-pong loop');
assert.ok(css.includes('2.52s steps(1, end) infinite'), '18-step ping-pong loop must preserve 140ms per supplied frame');
assert.ok(css.includes('sepia(1)') && css.includes('saturate(7.5)'), 'grayscale animation mask must be colorized back to hot orange lava rather than white');
assert.ok(css.includes('mix-blend-mode: screen'), 'animated veins must brighten the underlying colored Fire photograph');
assert.doesNotMatch(css, /hollowgate-fire-vein-breathe/, 'old procedural Fire surface pulse must remain removed');
assert.ok(boost.includes('const pingPongLength = FIRE_FRAME_COUNT * 2 - 2'), '3D Fire must use an 18-step ping-pong cycle');
assert.ok(boost.includes('frameIndex = sequenceIndex < FIRE_FRAME_COUNT ? sequenceIndex : pingPongLength - sequenceIndex'), '3D Fire frame order must reverse after frame 10');
assert.ok(boost.includes("material.emissive?.set?.('#ff5a18')"), '3D grayscale emissive masks must glow orange rather than white');
assert.ok(boost.includes('drawFireAtlasFrame'), '3D Fire must draw the selected atlas frame');
assert.ok(boost.includes("? 0.6 + rollingPulse * 1.12"), 'external Fire point-light animation must remain unchanged');
console.log('Fire supplied-frame ping-pong/color verification passed.');
