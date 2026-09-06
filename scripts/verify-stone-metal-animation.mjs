import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8');
const exists = (path) => fs.existsSync(new URL(path, root));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

const surface = read('src/app/components/session/dice/DiceSkinSurface.tsx');
const stoneOverlay = read('src/app/components/session/dice/DiceStoneAnimatedOverlay.tsx');
const stoneCss = read('src/app/components/session/dice/diceStoneAnimation.css');
const effects = read('src/app/components/session/dice/dice3dSkinEffects.ts');

expect(exists('src/app/components/session/dice/DiceMetalAnimatedOverlay.tsx'), 'Metal must have a dedicated 2D animated overlay component');
expect(exists('src/app/components/session/dice/diceMetalAnimation.css'), 'Metal must have dedicated 2D animation CSS');

if (exists('src/app/components/session/dice/DiceMetalAnimatedOverlay.tsx')) {
  const metalOverlay = read('src/app/components/session/dice/DiceMetalAnimatedOverlay.tsx');
  expect(metalOverlay.includes("appearance.skinId === 'metal' && appearance.effectsEnabled"), 'Metal animation must honor the Effects toggle');
  expect(metalOverlay.includes('hollowgate-metal-sweep'), 'Metal overlay must include a moving specular sweep');
  expect(metalOverlay.includes('hollowgate-metal-sparks'), 'Metal overlay must include fine metallic sparks');
}

if (exists('src/app/components/session/dice/diceMetalAnimation.css')) {
  const metalCss = read('src/app/components/session/dice/diceMetalAnimation.css');
  expect(metalCss.includes('@keyframes hollowgate-metal-sweep'), 'Metal must animate a specular sweep');
  expect(metalCss.includes('@keyframes hollowgate-metal-sparks'), 'Metal must animate metallic sparks');
  expect(metalCss.includes('@media (prefers-reduced-motion: reduce)'), 'Metal animation must respect reduced-motion');
}

expect(surface.includes('DiceMetalAnimatedOverlay'), 'DiceSkinSurface must import/render the Metal animated overlay');
expect(surface.includes('animatedMetal'), 'DiceSkinSurface must include Metal in animated layout handling');

expect(stoneOverlay.includes('hollowgate-stone-shards'), 'Stone overlay must include visible moving rock shards');
expect(stoneOverlay.includes('hollowgate-stone-impact'), 'Stone overlay must include a subtle impact/vibration layer');
expect(stoneCss.includes('@keyframes hollowgate-stone-shard-drift'), 'Stone must animate rock-shard drift');
expect(stoneCss.includes('@keyframes hollowgate-stone-impact-pulse'), 'Stone must animate a restrained impact pulse');

expect(effects.includes('function addMetalSparks('), '3D Metal must have a dedicated metallic spark effect');
expect(effects.includes("if (skinId === 'metal') addMetalSparks(group, updaters, radius);"), '3D Metal spark effect must be wired into the shared effect lifecycle');
expect(effects.includes('function addStoneDustBurst('), '3D Stone must have a dedicated stone dust/fragments effect');
expect(effects.includes("if (skinId === 'stone') addStoneDustBurst(group, updaters, radius);"), '3D Stone dust effect must be wired into the shared effect lifecycle');

if (failures.length) {
  throw new assert.AssertionError({
    message: `Stone/Metal animation regressions:\n- ${failures.join('\n- ')}`,
    actual: failures.length,
    expected: 0,
    operator: 'strictEqual',
  });
}

console.log('Stone and Metal 2D/3D animated effects verification passed.');
