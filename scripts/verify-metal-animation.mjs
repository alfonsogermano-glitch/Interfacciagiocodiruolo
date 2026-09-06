import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const overlayPath = new URL('src/app/components/session/dice/DiceMetalAnimatedOverlay.tsx', root);
const cssPath = new URL('src/app/components/session/dice/diceMetalAnimation.css', root);
const surface = fs.readFileSync(new URL('src/app/components/session/dice/DiceSkinSurface.tsx', root), 'utf8');
const icon = fs.readFileSync(new URL('src/app/components/session/dice/StyledStandardDieIcon.tsx', root), 'utf8');
const effects = fs.readFileSync(new URL('src/app/components/session/dice/dice3dSkinEffects.ts', root), 'utf8');

assert.ok(fs.existsSync(overlayPath), 'Metal must have a dedicated 2D animated overlay component');
assert.ok(fs.existsSync(cssPath), 'Metal must have dedicated animation CSS');
const overlay = fs.existsSync(overlayPath) ? fs.readFileSync(overlayPath, 'utf8') : '';
const css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';

assert.ok(overlay.includes("appearance.skinId === 'metal' && appearance.effectsEnabled"), 'Metal animation must obey the effects toggle');
assert.ok(overlay.includes('hollowgate-metal-sweep'), 'Metal overlay must include a moving reflective sweep');
assert.ok(overlay.includes('hollowgate-metal-spark'), 'Metal overlay must include dedicated sparks');
assert.ok(surface.includes("import { DiceMetalAnimatedOverlay, isAnimatedMetalAppearance } from './DiceMetalAnimatedOverlay';"), 'Dice surface must wire the Metal overlay');
assert.ok(surface.includes('const animatedMetal = isAnimatedMetalAppearance(appearance);'), 'Dice surface must classify animated Metal');
assert.ok(surface.includes('<DiceMetalAnimatedOverlay appearance={appearance} />'), 'Dice surface must render the Metal overlay');
assert.ok(icon.includes("import { DiceMetalAnimatedOverlay } from './DiceMetalAnimatedOverlay';") && icon.includes('<DiceMetalAnimatedOverlay appearance={appearance} />'), 'Standard die icons must render Metal animation');
assert.ok(css.includes('@keyframes hollowgate-metal-sweep'), 'Metal reflective sweep must animate');
assert.ok(css.includes('@keyframes hollowgate-metal-spark-flash'), 'Metal sparks must animate');
assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'), 'Metal animation must respect reduced motion');
assert.ok(effects.includes("case 'metal':\n      return { frequency: 9.5"), 'Metal 3D profile must use a visibly active cadence');
assert.ok(effects.includes('particleCount: 12'), 'Metal 3D effect must emit enough sparks to be visible');
assert.ok(effects.includes('orbitSpeed: 3.2'), 'Metal 3D sparks must move crisply');
assert.ok(effects.includes('function addMetalSparks('), 'Metal must have a dedicated 3D spark effect');
assert.ok(effects.includes('addMetalSparks(group, updaters, radius);'), 'Metal 3D spark effect must be wired into the visual effect switch');

console.log('Metal 2D/3D shimmer, sweep and sparks verification passed.');
