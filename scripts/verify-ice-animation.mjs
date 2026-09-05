import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const overlay = fs.readFileSync(new URL('src/app/components/session/dice/DiceIceAnimatedOverlay.tsx', root), 'utf8');
const css = fs.readFileSync(new URL('src/app/components/session/dice/diceIceAnimation.css', root), 'utf8');
const fireOverlay = fs.readFileSync(new URL('src/app/components/session/dice/DiceFireAnimatedOverlay.tsx', root), 'utf8');
const surface = fs.readFileSync(new URL('src/app/components/session/dice/DiceSkinSurface.tsx', root), 'utf8');
const styled = fs.readFileSync(new URL('src/app/components/session/dice/StyledStandardDieIcon.tsx', root), 'utf8');
const effects = fs.readFileSync(new URL('src/app/components/session/dice/dice3dSkinEffects.ts', root), 'utf8');
const boost = fs.readFileSync(new URL('src/app/components/session/dice/dice3dVisualBoost.ts', root), 'utf8');
const materials = fs.readFileSync(new URL('src/app/components/session/dice/dice3dAppearanceMaterials.ts', root), 'utf8');
const renderer = fs.readFileSync(new URL('src/app/components/session/dice/dice3dRenderer.ts', root), 'utf8');
const session = fs.readFileSync(new URL('src/app/components/session/dice/DiceSessionContext.tsx', root), 'utf8');

assert.ok(overlay.includes("appearance.skinId === 'ice' && appearance.effectsEnabled"), 'Ice 2D animation must be gated by Ice + effectsEnabled');
assert.ok(overlay.includes('getDiceTextureBackgroundSize(appearance.textureScale)'), 'animated Ice overlay must use shared textureScale');
assert.ok(
  overlay.includes('data-dice-ice-animated-texture-under') && overlay.includes('data-dice-ice-animated-texture-over'),
  'Ice must use two independently moving photographic texture layers for translucent refraction',
);
assert.ok(overlay.includes('data-dice-ice-animated-frost') && overlay.includes('data-dice-ice-animated-crystals') && overlay.includes('data-dice-ice-animated-shimmer'), 'Ice overlay must combine frost, crystals and shimmer');
assert.ok(
  css.includes('@keyframes hollowgate-ice-refraction-under') &&
  css.includes('@keyframes hollowgate-ice-refraction-over') &&
  css.includes('@keyframes hollowgate-ice-frost-drift') &&
  css.includes('@keyframes hollowgate-ice-shimmer-sweep') &&
  css.includes('@keyframes hollowgate-ice-crystal-twinkle'),
  'Ice 2D must use slow translucent refraction, frost drift, shimmer and crystal twinkle',
);
assert.ok(!css.includes('hollowgate-ice-frost-breathe'), 'Ice must not use a fire-like breathing/pulsing animation');
assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'), 'Ice 2D must respect reduced motion');
assert.ok(css.includes('[data-dice-skin-preview-art="ice"]'), 'obsolete procedural Ice preview art must be suppressed');
assert.ok(fireOverlay.includes("appearance.skinId === 'ice'"), 'shared standard-die renderer must route Ice to its dedicated overlay');
assert.ok(surface.includes('isAnimatedIceAppearance(appearance)'), 'skin swatches must reserve a clipped animated Ice surface');
assert.ok(styled.includes('<DiceFireAnimatedOverlay appearance={appearance} />'), 'standard shared die renderer must receive the routed Ice overlay');
assert.ok(effects.includes("case 'ice':") && effects.includes('addIceCrystals(group, updaters, radius)'), '3D Ice must retain its dedicated animated crystal particles');
assert.ok(effects.includes('window.requestAnimationFrame(frame)') && effects.includes('window.cancelAnimationFrame(this.raf)'), '3D Ice controller must animate independently during rolling and clean up');
assert.ok(
  effects.includes("case 'ice':\n      return { frequency: 4.1, emissiveColor: '#70eaff', emissiveBase: 0.25, emissivePulse: 0, roughnessPulse: 0, metalnessPulse: 0, shininessPulse: 0,"),
  'Ice edge material brightness must stay constant while crystals continue animating',
);
assert.ok(materials.includes("material.emissiveIntensity = skinId === 'ice' ? 0.25 : 0.11;"), 'Ice static edge glow must match the stable animated baseline');
assert.ok(boost.includes("const ICE_LIGHT_INTENSITY = 0.56;"), 'Ice must use a stable cold-light intensity across rolling and settled phases');
assert.ok(
  boost.includes("skin === 'ice'\n          ? ICE_LIGHT_INTENSITY"),
  'Ice visual boost must not derive brightness from the time-based rolling pulse',
);
assert.ok(boost.includes("case 'ice': return '#8eeeff'"), '3D Ice must keep the cold light boost');
assert.ok(renderer.includes('private releaseAppearanceEffects') && renderer.includes('this.releaseAppearanceEffects();'), '3D effects must remain alive until clear/abort');
assert.ok(renderer.includes('this.startSettledRenderLoop();') && renderer.includes('this.stopSettledRenderLoop();'), 'Ice effects must keep rendering throughout the settled hold and stop only on clear');
assert.ok(session.includes('DICE_ANIMATED_SETTLED_HOLD_MS = 2000'), 'animated Ice must remain visible for two seconds after settling');
assert.ok(session.includes('descriptor?.appearance.effectsEnabled'), 'two-second hold must be tied to effectsEnabled');
console.log('Animated Ice 2D/3D lifecycle and stable rolling-to-settled brightness verification passed.');
