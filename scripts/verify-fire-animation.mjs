import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const overlayUrl = new URL('src/app/components/session/dice/DiceFireAnimatedOverlay.tsx', root);
const cssUrl = new URL('src/app/components/session/dice/diceFireAnimation.css', root);
assert.ok(fs.existsSync(overlayUrl), 'animated Fire preview overlay must exist');
assert.ok(fs.existsSync(cssUrl), 'animated Fire preview CSS must exist');

const overlay = fs.readFileSync(overlayUrl, 'utf8');
const css = fs.readFileSync(cssUrl, 'utf8');
const skinSurface = fs.readFileSync(new URL('src/app/components/session/dice/DiceSkinSurface.tsx', root), 'utf8');
const styled = fs.readFileSync(new URL('src/app/components/session/dice/StyledStandardDieIcon.tsx', root), 'utf8');
const boost = fs.readFileSync(new URL('src/app/components/session/dice/dice3dVisualBoost.ts', root), 'utf8');

assert.ok(overlay.includes("appearance.skinId !== 'fire' || !appearance.effectsEnabled"), 'Fire preview animation must be gated by Fire + effectsEnabled');
assert.ok(overlay.includes('getDiceTextureBackgroundSize(appearance.textureScale)'), 'animated overlay must keep the selected texture zoom');
assert.ok(overlay.includes('FIRE_TEXTURE_DATA_URL'), 'animated overlay must reuse the supplied Fire image');
assert.ok(css.includes('@keyframes hollowgate-fire-texture-breathe'), 'Fire preview must have a texture breathing animation');
assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'), 'Fire preview animation must respect reduced motion');
assert.ok(skinSurface.includes('<DiceFireAnimatedOverlay appearance={appearance} />'), 'skin swatches must render the animated Fire overlay');
assert.ok(styled.includes('<DiceFireAnimatedOverlay appearance={appearance} />'), 'shared standard die previews must render the animated Fire overlay');
assert.ok(boost.includes("skin === 'fire' && !descriptor.custom"), '3D Fire texture pulse must stay on standard Fire dice');
assert.ok(boost.includes('material.emissiveMap') && boost.includes('FIRE_TEXTURE_EMISSIVE_PULSE'), '3D Fire must pulse the photographic emissive map itself');
console.log('Animated Fire skin verification passed.');
