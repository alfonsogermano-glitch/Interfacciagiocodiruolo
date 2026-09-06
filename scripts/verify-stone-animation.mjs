import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const overlay = fs.readFileSync(new URL('src/app/components/session/dice/DiceStoneAnimatedOverlay.tsx', root), 'utf8');
const css = fs.readFileSync(new URL('src/app/components/session/dice/diceStoneAnimation.css', root), 'utf8');
const effects = fs.readFileSync(new URL('src/app/components/session/dice/dice3dSkinEffects.ts', root), 'utf8');
const renderer = fs.readFileSync(new URL('src/app/components/session/dice/dice3dRenderer.ts', root), 'utf8');

assert.ok(overlay.includes('hollowgate-stone-shard'), 'Stone 2D overlay must include animated rock shards');
assert.ok(overlay.includes('hollowgate-stone-impact'), 'Stone 2D overlay must include an impact pulse layer');
assert.ok(css.includes('@keyframes hollowgate-stone-shard-tumble'), 'Stone shards must visibly tumble');
assert.ok(css.includes('@keyframes hollowgate-stone-impact-pulse'), 'Stone must have a visible impact pulse');
assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'), 'Stone animation must respect reduced motion');
assert.ok(effects.includes("case 'stone':\n      return { frequency: 4.2"), 'Stone 3D profile must use the stronger animated cadence');
assert.ok(effects.includes('particleCount: 14'), 'Stone 3D effect must emit enough dust/grit to be visible');
assert.ok(effects.includes('orbitSpeed: 0.85'), 'Stone 3D particles must move visibly without looking magical');
assert.ok(effects.includes('for (let index = 0; index < 8; index += 1)'), 'Stone 3D effect must use eight dedicated fragments');
assert.ok(renderer.includes("descriptor.appearance.skinId === 'stone' || descriptor.appearance.skinId === 'metal'"), 'Renderer must explicitly classify Stone as requiring active rolling renders');
const stoneRollingRender = renderer.indexOf('if (needsRollingEffectsRender) this.startSettledRenderLoop();');
const rollCall = renderer.indexOf('await this.box.roll(notation);');
assert.ok(stoneRollingRender >= 0 && rollCall > stoneRollingRender, 'Stone rolling effect render loop must start before the physical 3D roll');

console.log('Stone 2D/3D animated dust, shards, impact and rolling render lifecycle verification passed.');
