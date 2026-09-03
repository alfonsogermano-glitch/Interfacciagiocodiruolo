import assert from 'node:assert/strict';
import fs from 'node:fs';

const previewArt = fs.readFileSync(new URL('../src/app/components/session/dice/DiceSkinPreviewArt.tsx', import.meta.url), 'utf8');
const skins = fs.readFileSync(new URL('../src/app/components/session/dice/diceSkins.ts', import.meta.url), 'utf8');
const textures = fs.readFileSync(new URL('../src/app/components/session/dice/dice3dSkinTextures.ts', import.meta.url), 'utf8');
const appearance = fs.readFileSync(new URL('../src/app/components/session/dice/dice3dAppearanceMaterials.ts', import.meta.url), 'utf8');
const history = fs.readFileSync(new URL('../src/app/components/session/dice/DiceRollHistoryCard.tsx', import.meta.url), 'utf8');

assert.ok(skins.includes('FIRE_TEXTURE_DATA_URL'), '2D Fire must use the supplied photographic texture');
assert.ok(previewArt.includes("case 'fire':\n      return null;"), 'Fire must not overlay the old illustrative flame art on the photographic texture');
assert.ok(textures.includes("context.globalCompositeOperation = 'source-over';\n  context.globalAlpha = 0.34;"), '3D Fire must use the same source-over body-color tint as the 2D preview');
assert.doesNotMatch(textures, /globalCompositeOperation = 'color'[\s\S]{0,80}globalAlpha = 0\.46/, '3D Fire must not use the old color blend that diverges from the 2D preview');
assert.ok(appearance.includes('getReadable3DLabelColor'), '3D labels must use automatic contrast correction on textured dice');
assert.ok(appearance.includes('factory.label_color = labelColor') && appearance.includes('factory.label_color_rand = labelColor'), '3D renderer must apply the corrected readable label color');
assert.ok(appearance.includes('MIN_TEXTURED_LABEL_CONTRAST'), 'Textured dice must enforce a minimum label/background contrast');
assert.ok(history.includes('useDiceAppearance'), 'Roll history must be able to read the current standard-die appearance');
assert.ok(history.includes('result.rollerId === user?.id') && history.includes('getStandardAppearance(die.sides)'), 'Local standard-die history entries must follow the current saved appearance');
assert.ok(history.includes(': group.appearance'), 'Remote roll history must retain the roller appearance snapshot');

console.log('Fire texture consistency, live local history style, and 3D label contrast verification passed.');
