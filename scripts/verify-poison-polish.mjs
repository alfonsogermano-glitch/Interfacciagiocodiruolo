import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const textures = fs.readFileSync(new URL('src/app/components/session/dice/dice3dSkinTextures.ts', root), 'utf8');
const effects = fs.readFileSync(new URL('src/app/components/session/dice/dice3dSkinEffects.ts', root), 'utf8');
const boost = fs.readFileSync(new URL('src/app/components/session/dice/dice3dVisualBoost.ts', root), 'utf8');
const css = fs.readFileSync(new URL('src/app/components/session/dice/dicePoisonAnimation.css', root), 'utf8');

assert.ok(
  textures.includes("context.filter = 'brightness(1.32) saturate(1.26) contrast(1.06)'"),
  'Poison photo faces must use the brighter lime-forward polish',
);
assert.ok(
  textures.includes('context.globalAlpha = 0.075') && textures.includes("context.fillStyle = '#b7ff4a'"),
  'Poison photo faces must receive a restrained acidic-green screen lift',
);

assert.ok(
  effects.includes("case 'poison':\n      return { frequency: 6.6, emissiveColor: '#7dff4d', emissiveBase: 0.08, emissivePulse: 0.32, roughnessPulse: 0.16, metalnessPulse: 0, shininessPulse: 42, particleColor: '#b4ff68', particleCount: 20, particleOpacity: 0.96, particleSize: 0.13, orbitSpeed: 1.7, lightningBolts: 0, arcaneRing: false };"),
  'Poison 3D effect profile must be brighter, faster, and denser',
);
assert.ok(effects.includes('for (let index = 0; index < 8; index += 1)'), 'Poison must render eight animated bubbles');
assert.ok(
  effects.includes("createGlowMaterial(index % 2 ? '#9aff63' : '#d8ff79', 0.44)"),
  'Poison bubbles must use brighter toxic-lime materials',
);
assert.ok(
  effects.includes('elapsed * (0.82 + index * 0.07)')
    && effects.includes('Math.sin(elapsed * 1.65 + phase) * radius * 0.62'),
  'Poison bubbles must move faster and through a larger vertical range',
);
assert.ok(
  effects.includes('0.72 + wave * 0.58 + Math.sin(elapsed * 2.8 + phase) * 0.12')
    && effects.includes('material.opacity = 0.3 + wave * 0.42'),
  'Poison bubbles must pulse more visibly',
);
assert.ok(
  effects.includes("skinId === 'poison'\n          ? 1.16 + Math.sin(elapsed * phase.pulse * 1.35 + index) * 0.17")
    && effects.includes("skinId === 'poison'\n          ? Math.sin(elapsed * 2.2 + index * 0.7) * 0.52"),
  'Poison particles must have a stronger organic drift',
);

assert.ok(boost.includes("case 'poison': return '#a6ff4f';"), 'Poison moving light must use a brighter acidic green');
assert.ok(
  boost.includes("skin === 'poison' ? 0.82")
    && boost.includes("skin === 'poison'\n          ? 0.52 + rollingPulse * 0.6"),
  'Poison moving light must be stronger during rolls and settled animation',
);

assert.ok(css.includes('animation: hollowgate-poison-texture-breathe 2.2s ease-in-out infinite;'), 'Poison 2D texture breathing must be faster');
assert.ok(css.includes('animation: hollowgate-poison-ooze-pulse 1.7s ease-in-out infinite alternate;'), 'Poison 2D ooze pulse must be faster');
assert.ok(css.includes('animation: hollowgate-poison-bubbles 1.55s ease-in-out infinite;'), 'Poison 2D bubbles must be livelier');
assert.ok(css.includes('opacity: 0.5;'), 'Poison 2D bubbles must be more visible');

console.log('Poison brightness and animation polish verification passed.');
