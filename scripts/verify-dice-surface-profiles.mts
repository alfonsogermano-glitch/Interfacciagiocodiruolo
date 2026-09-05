import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import type { DiceAppearance } from '../src/app/components/session/dice/diceTypes.ts';

const moduleUrl = new URL('../src/app/components/session/dice/dice3dSurfaceProfiles.ts', import.meta.url);
assert.ok(fs.existsSync(moduleUrl), 'the shared 3D surface-profile module must exist');

const { applyDice3DSurfaceProfile, getDice3DSurfaceProfile } = await import(moduleUrl.href);

const appearance = (skinId: DiceAppearance['skinId']): DiceAppearance => ({
  bodyColor: '#c63d35',
  symbolColor: '#172129',
  skinId,
  effectsEnabled: true,
});

const texture = new THREE.Texture();
const edge = new THREE.MeshPhongMaterial({ color: '#c63d35' });
const iceFace = new THREE.MeshPhongMaterial({ color: '#ffffff', map: texture });
iceFace.depthTest = false;
iceFace.depthWrite = false;
const iceMesh = { material: [edge, iceFace] };

assert.equal(getDice3DSurfaceProfile('ice'), 'photo-unlit');
applyDice3DSurfaceProfile(iceMesh, { appearance: appearance('ice'), custom: false });
assert.equal(iceMesh.material[0], edge, 'Ice must preserve the user-colored edge material');
assert.ok(iceMesh.material[1] instanceof THREE.MeshBasicMaterial, 'Ice faces must use a genuinely unlit material');
assert.equal(iceMesh.material[1].map, texture, 'Ice faces must preserve the composite photograph-and-number map');
assert.equal(iceMesh.material[1].toneMapped, false, 'Ice faces must bypass tone mapping');
assert.equal(iceMesh.material[1].depthTest, false, 'Ice faces must preserve upstream depth behavior');
assert.equal(iceMesh.material[1].depthWrite, false, 'Ice faces must preserve upstream depth writes');

const lightningTexture = new THREE.Texture();
const lightningEdge = new THREE.MeshPhongMaterial({ color: '#4cdcff' });
const lightningFace = new THREE.MeshPhongMaterial({ color: '#ffffff', map: lightningTexture });
const lightningMesh = { material: [lightningEdge, lightningFace] };
assert.equal(getDice3DSurfaceProfile('lightning'), 'photo-unlit');
applyDice3DSurfaceProfile(lightningMesh, { appearance: appearance('lightning'), custom: false });
assert.equal(lightningMesh.material[0], lightningEdge, 'Lightning must preserve its electric edge material');
assert.ok(lightningMesh.material[1] instanceof THREE.MeshBasicMaterial, 'Lightning photographic faces must use a genuinely unlit material');
assert.equal(lightningMesh.material[1].map, lightningTexture, 'Lightning faces must preserve the photographic composite map');
assert.equal(lightningMesh.material[1].toneMapped, false, 'Lightning faces must bypass tone mapping for stable vivid color');
assert.equal(lightningMesh.material[1].color.getHex(), 0xffffff, 'Lightning faces must keep a neutral white texture multiplier');

const fireEdge = new THREE.MeshPhongMaterial({ color: '#c63d35' });
const fireFace = new THREE.MeshPhongMaterial({ color: '#ffffff', map: texture });
const fireMesh = { material: [fireEdge, fireFace] };
assert.equal(getDice3DSurfaceProfile('fire'), 'photo-lit');
applyDice3DSurfaceProfile(fireMesh, { appearance: appearance('fire'), custom: false });
assert.equal(fireMesh.material[0], fireEdge, 'Fire must preserve its edge material');
assert.equal(fireMesh.material[1], fireFace, 'Fire must preserve its existing lit face material');

const customFace = new THREE.MeshPhongMaterial({ map: texture });
const customMesh = { material: [fireEdge, customFace] };
applyDice3DSurfaceProfile(customMesh, { appearance: appearance('ice'), custom: true });
assert.equal(customMesh.material[1], customFace, 'Custom dice must remain outside standard-skin profiles');

console.log('Shared 3D surface profiles preserve Ice/Lightning photography, Fire lighting, edges, and Custom materials.');
