import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installDiceAppearanceAdapter } from '../src/app/components/session/dice/dice3dAppearanceMaterials.ts';
import type { Dice3DAppearanceDescriptor } from '../src/app/components/session/dice/dice3dProjection.ts';

type DiceFactoryState = {
  dice_color?: string;
  dice_color_rand?: string;
  edge_color?: string;
  edge_color_rand?: string;
  label_color?: string;
  label_outline?: string;
  material_options?: Record<string, unknown>;
};

const BLACK = '#000000';
const YELLOW = '#ffff00';

function descriptor(bodyColor: string): Dice3DAppearanceDescriptor {
  return {
    appearance: { bodyColor, symbolColor: '#ffffff', skinId: 'fire', effectsEnabled: false },
    custom: false,
    preserveFaceColors: false,
  };
}

const states: DiceFactoryState[] = [];
const box = {
  DiceFactory: {
    create(this: { dice_color?: string; dice_color_rand?: string; edge_color?: string; edge_color_rand?: string; label_color?: string; label_outline?: string; material_options?: Record<string, unknown> }, _type: string) {
      states.push({
        dice_color: this.dice_color,
        dice_color_rand: this.dice_color_rand,
        edge_color: this.edge_color,
        edge_color_rand: this.edge_color_rand,
        label_color: this.label_color,
        label_outline: this.label_outline,
        material_options: this.material_options,
      });
      return {};
    },
    setMaterialInfo() {},
  },
};

const adapter = installDiceAppearanceAdapter(box, [descriptor(BLACK), descriptor(YELLOW)]);
try {
  box.DiceFactory.create('d6');
  box.DiceFactory.create('d6');
} finally {
  adapter.restore();
}

assert.equal(states.length, 2, 'one factory state must be captured per die created');
const [blackState, yellowState] = states;

assert.equal(blackState.dice_color, '#ffffff', 'skinned face base must stay white when bodyColor is black');
assert.equal(yellowState.dice_color, '#ffffff', 'skinned face base must stay white when bodyColor is yellow');
assert.equal(blackState.dice_color_rand, '#ffffff', 'skinned face random base must stay white for black bodyColor');
assert.equal(yellowState.dice_color_rand, '#ffffff', 'skinned face random base must stay white for yellow bodyColor');
assert.equal(blackState.material_options?.color, 0xffffff, 'material multiplier must be neutral for black bodyColor');
assert.equal(yellowState.material_options?.color, 0xffffff, 'material multiplier must be neutral for yellow bodyColor');

assert.equal(blackState.edge_color, BLACK, 'edge must follow black bodyColor');
assert.equal(yellowState.edge_color, YELLOW, 'edge must follow yellow bodyColor');
assert.notEqual(blackState.edge_color, yellowState.edge_color, 'opposite bodyColors must produce opposite edge colors');
assert.equal(blackState.label_color, yellowState.label_color, 'photographic skin label color must never depend on bodyColor');

const textures = fs.readFileSync(
  new URL('../src/app/components/session/dice/dice3dSkinTextures.ts', import.meta.url),
  'utf8',
);
assert.ok(!textures.includes('bodyColor'), 'the photographic face texture pipeline must be entirely bodyColor-independent');
assert.ok(!/drawFirePhotoTexture\([^)]*bodyColor/.test(textures), 'fire face texture must not accept bodyColor tinting');
assert.ok(!textures.includes('appearance.bodyColor'), 'the per-skin texture cache key/name must never include bodyColor');

const materials = fs.readFileSync(
  new URL('../src/app/components/session/dice/dice3dAppearanceMaterials.ts', import.meta.url),
  'utf8',
);
assert.ok(
  materials.includes('const faceColor = appearance.skinId === \'none\' ? appearance.bodyColor : \'#ffffff\';'),
  'skinned dice must keep the neutral white face base',
);
assert.ok(
  materials.includes('factory.edge_color = appearance.bodyColor;') && materials.includes('factory.edge_color_rand = appearance.bodyColor;'),
  'bodyColor must continue to drive exclusively the edge material for skinned dice',
);

console.log('Photographic face/body-color isolation red/green verification passed.');