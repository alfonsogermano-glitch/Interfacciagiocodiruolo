import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const data = fs.readFileSync(new URL('src/app/components/session/dice/fireFrameAtlasData.ts', root), 'utf8');
const overlay = fs.readFileSync(new URL('src/app/components/session/dice/DiceFireAnimatedOverlay.tsx', root), 'utf8');
const css = fs.readFileSync(new URL('src/app/components/session/dice/diceFireAnimation.css', root), 'utf8');
const boost = fs.readFileSync(new URL('src/app/components/session/dice/dice3dVisualBoost.ts', root), 'utf8');

assert.ok(data.includes('FIRE_FRAME_COUNT = 10'), 'Fire animation must expose exactly 10 frames');
assert.ok(data.includes('FIRE_FRAME_ATLAS_DATA_URL'), 'Fire animation must expose the shared frame atlas');
assert.ok(overlay.includes('FIRE_FRAME_ATLAS_DATA_URL'), '2D Fire previews must use the frame atlas');
assert.ok(overlay.includes('data-dice-fire-frame-sequence'), '2D Fire previews must render the frame sequence layer');
assert.ok(css.includes('@keyframes hollowgate-fire-frame-loop'), '2D Fire must define the 10-frame loop');
for (const marker of ['0%', '10%', '20%', '30%', '40%', '50%', '60%', '70%', '80%', '90%', '100%']) assert.ok(css.includes(marker), `Fire frame loop must include ${marker}`);
assert.ok(css.includes('steps(1, end)'), 'Fire frame loop must switch discretely with no crossfade');
assert.doesNotMatch(css, /hollowgate-fire-vein-breathe/, 'old procedural Fire surface pulse must be removed');
assert.ok(boost.includes('FIRE_FRAME_ATLAS_DATA_URL'), '3D Fire animation must use the same frame atlas');
assert.ok(boost.includes('FIRE_FRAME_COUNT'), '3D Fire animation must step through all ten frames');
assert.ok(boost.includes('frameIndex = Math.floor'), '3D Fire animation must use discrete frame stepping');
assert.ok(boost.includes('drawFireAtlasFrame'), '3D Fire must draw the selected atlas frame');
assert.ok(boost.includes("? 0.6 + rollingPulse * 1.12"), 'external Fire point-light animation must remain unchanged');
console.log('Fire 10-frame texture loop verification passed.');
