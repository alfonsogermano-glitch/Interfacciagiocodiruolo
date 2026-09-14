import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Lo shield delle etichette riflettenti (solo skin metallo/ossidiana) inietta
// GLSL nel programma delle facce: ogni identificatore usato deve esistere
// nella versione di three installata, altrimenti il programma non compila e
// le facce restano nere/invisibili con soli spigoli e numeri.
const materials = await readFile(new URL('../src/app/components/session/dice/dice3dAppearanceMaterials.ts', import.meta.url), 'utf8');
const root = new URL('../', import.meta.url);
const parsFragment = await readFile(new URL('node_modules/three/src/renderers/shaders/ShaderChunk/uv_pars_fragment.glsl.js', root), 'utf8');
const phongFragment = await readFile(new URL('node_modules/three/src/renderers/shaders/ShaderLib/meshphong.glsl.js', root), 'utf8');

// La versione installata dichiara il varying UV canale-singolo (vUv, pre-r151)
// oppure quello per-mappa (vMapUv, r151+).
const declaresChannels = /varying\s+vec2\s+vMapUv/.test(parsFragment);
const declaresLegacy = /varying\s+vec2\s+vUv/.test(parsFragment);
assert.ok(declaresChannels !== declaresLegacy, 'installed three must declare exactly one map-UV varying');
const expectedVarying = declaresChannels ? 'vMapUv' : 'vUv';

// L'injection deve scegliere il varying in base al chunk di output (stessa
// convenzione della selezione colorspace/encodings gia' presente).
assert.match(
  materials,
  /REFLECTIVE_UV_VARYING_CHANNELS = 'vMapUv'/,
  'shield must know the per-map UV varying of newer three versions',
);
assert.match(
  materials,
  /REFLECTIVE_UV_VARYING_LEGACY = 'vUv'/,
  'shield must know the single UV varying of older three versions',
);
const branch = materials.match(/const uvVarying = outputChunk === '#include <colorspace_fragment>'\s*\?\s*(\S+)\s*:\s*(\S+);/);
assert.ok(branch, 'shield must select the UV varying from the detected output chunk');
const constantValue = (name) => materials.match(new RegExp(`${name} = '(v\\w+)'`))?.[1];
const installedUsesColorspace = phongFragment.includes('#include <colorspace_fragment>');
const selectedForInstalled = constantValue(installedUsesColorspace ? branch[1] : branch[2]);
assert.equal(
  selectedForInstalled,
  expectedVarying,
  `installed three declares ${expectedVarying} but the shield would inject ${selectedForInstalled}`,
);
assert.doesNotMatch(
  materials,
  /texture2D\((reflectiveLabelMask|map), vMapUv\)/,
  'shield must never hardcode vMapUv outside the version branch',
);

console.log(`Reflective label shield verification: PASS (three uses ${expectedVarying})`);
