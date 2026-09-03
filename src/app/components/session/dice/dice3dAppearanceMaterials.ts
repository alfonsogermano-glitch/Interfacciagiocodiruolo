import { getDice3DTextureDescriptor } from './dice3dSkinTextures.ts';
import { Dice3DSkinEffectController } from './dice3dSkinEffects.ts';
import type { Dice3DAppearanceDescriptor, Dice3DProjectionChunk } from './dice3dProjection.ts';

type DiceFactoryLike = {
  create: (type: string) => unknown;
  setMaterialInfo?: () => void;
  dice_color?: string;
  dice_color_rand?: string;
  edge_color?: string;
  edge_color_rand?: string;
  label_color?: string;
  label_color_rand?: string;
  label_outline?: string;
  label_outline_rand?: string;
  dice_texture?: unknown;
  dice_texture_rand?: unknown;
  dice_material?: unknown;
  dice_material_rand?: unknown;
  material_options?: Record<string, unknown>;
};

type DiceBoxLike = {
  DiceFactory?: unknown;
  swapDiceFace_D4?: (dicemesh: unknown, result: unknown) => unknown;
};

type MaterialLike = {
  roughness?: number;
  metalness?: number;
  shininess?: number;
  opacity?: number;
  transparent?: boolean;
  emissive?: { set?: (value: string | number) => unknown };
  emissiveIntensity?: number;
  needsUpdate?: boolean;
};

type MeshLike = {
  material?: MaterialLike | MaterialLike[];
};

function captureFactoryState(factory: DiceFactoryLike) {
  return {
    dice_color: factory.dice_color,
    dice_color_rand: factory.dice_color_rand,
    edge_color: factory.edge_color,
    edge_color_rand: factory.edge_color_rand,
    label_color: factory.label_color,
    label_color_rand: factory.label_color_rand,
    label_outline: factory.label_outline,
    label_outline_rand: factory.label_outline_rand,
    dice_texture: factory.dice_texture,
    dice_texture_rand: factory.dice_texture_rand,
    dice_material: factory.dice_material,
    dice_material_rand: factory.dice_material_rand,
    material_options: factory.material_options,
  };
}

function applyAppearanceFactoryState(factory: DiceFactoryLike, descriptor: Dice3DAppearanceDescriptor) {
  const appearance = descriptor.appearance;
  factory.dice_color = appearance.bodyColor;
  factory.dice_color_rand = appearance.bodyColor;
  factory.edge_color = appearance.bodyColor;
  factory.edge_color_rand = appearance.bodyColor;
  factory.label_color = appearance.symbolColor;
  factory.label_color_rand = appearance.symbolColor;
  factory.label_outline = appearance.symbolColor;
  factory.label_outline_rand = appearance.symbolColor;

  let texture;
  try {
    texture = getDice3DTextureDescriptor(appearance);
  } catch (error) {
    console.error('Texture skin 3D non disponibile, uso il materiale neutro:', error);
    texture = { name: 'none', texture: null, bump: null, composite: 'source-over', material: 'none' } as const;
  }
  factory.dice_texture = texture;
  factory.dice_texture_rand = texture;
  factory.dice_material = texture.material;
  factory.dice_material_rand = texture.material;
  factory.material_options = { ...factory.material_options, color: 0xffffff };
}

function materialsOf(mesh: MeshLike): MaterialLike[] {
  if (!mesh.material) return [];
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function applyStaticSkinToMesh(mesh: unknown, descriptor: Dice3DAppearanceDescriptor) {
  if (!mesh || typeof mesh !== 'object') return;
  const skinId = descriptor.appearance.skinId;
  if (skinId === 'none') return;

  for (const material of materialsOf(mesh as MeshLike)) {
    switch (skinId) {
      case 'fire':
        if (typeof material.roughness === 'number') material.roughness = 0.72;
        if (typeof material.shininess === 'number') material.shininess = 22;
        break;
      case 'ice':
        if (typeof material.roughness === 'number') material.roughness = 0.18;
        if (typeof material.metalness === 'number') material.metalness = 0.05;
        if (typeof material.shininess === 'number') material.shininess = 90;
        break;
      case 'lightning':
        if (typeof material.roughness === 'number') material.roughness = 0.3;
        if (typeof material.shininess === 'number') material.shininess = 72;
        break;
      case 'poison':
        if (typeof material.roughness === 'number') material.roughness = 0.48;
        if (typeof material.shininess === 'number') material.shininess = 38;
        break;
      case 'stone':
        if (typeof material.roughness === 'number') material.roughness = 0.95;
        if (typeof material.metalness === 'number') material.metalness = 0;
        if (typeof material.shininess === 'number') material.shininess = 3;
        break;
      case 'metal':
        if (typeof material.roughness === 'number') material.roughness = 0.24;
        if (typeof material.metalness === 'number') material.metalness = 0.88;
        if (typeof material.shininess === 'number') material.shininess = 110;
        break;
      case 'obsidian':
        if (typeof material.roughness === 'number') material.roughness = 0.16;
        if (typeof material.metalness === 'number') material.metalness = 0.22;
        if (typeof material.shininess === 'number') material.shininess = 120;
        break;
      case 'arcane':
        if (typeof material.roughness === 'number') material.roughness = 0.32;
        if (typeof material.shininess === 'number') material.shininess = 80;
        break;
    }

    if (!descriptor.preserveFaceColors && material.emissive && typeof material.emissive.set === 'function') {
      if (['fire', 'lightning', 'poison', 'obsidian', 'arcane'].includes(skinId)) {
        material.emissive.set(descriptor.appearance.bodyColor);
        if (typeof material.emissiveIntensity === 'number') material.emissiveIntensity = 0.06;
      }
    }
    material.needsUpdate = true;
  }
}

export function buildSimultaneousAppearanceQueue(
  chunks: Dice3DProjectionChunk[],
): Array<Dice3DAppearanceDescriptor | null> {
  const grouped = new Map<number, Array<Dice3DAppearanceDescriptor | null>>();
  for (const chunk of chunks) {
    const appearances = chunk.appearances ?? chunk.values.map(() => null);
    const target = grouped.get(chunk.sides) ?? [];
    target.push(...appearances);
    grouped.set(chunk.sides, target);
  }
  return [...grouped.values()].flat();
}

export function installDiceAppearanceAdapter(
  box: DiceBoxLike,
  queue: Array<Dice3DAppearanceDescriptor | null>,
): { restore: () => void; effects: Dice3DSkinEffectController } {
  const candidateFactory = box.DiceFactory;
  if (!candidateFactory || typeof candidateFactory !== 'object') {
    throw new Error('Il renderer 3D non espone il factory richiesto per la personalizzazione.');
  }
  const factory = candidateFactory as DiceFactoryLike;
  if (typeof factory.create !== 'function') {
    throw new Error('Il renderer 3D non espone il factory richiesto per la personalizzazione.');
  }

  const originalCreate = factory.create.bind(factory);
  const originalSetMaterialInfo = factory.setMaterialInfo?.bind(factory);
  const previousSwapD4 = box.swapDiceFace_D4;
  const d4Appearance = new WeakMap<object, Dice3DAppearanceDescriptor>();
  const effects = new Dice3DSkinEffectController();
  let queueIndex = 0;

  factory.create = (type: string) => {
    const descriptor = queue[queueIndex++] ?? null;
    if (!descriptor) return originalCreate(type);

    const originalState = captureFactoryState(factory);
    const currentSetMaterialInfo = factory.setMaterialInfo?.bind(factory);
    if (currentSetMaterialInfo) {
      factory.setMaterialInfo = () => {
        currentSetMaterialInfo();
        applyAppearanceFactoryState(factory, descriptor);
      };
    }

    try {
      applyAppearanceFactoryState(factory, descriptor);
      const mesh = originalCreate(type);
      applyStaticSkinToMesh(mesh, descriptor);
      effects.registerMesh(mesh, descriptor);
      if (type === 'd4' && mesh && typeof mesh === 'object') d4Appearance.set(mesh as object, descriptor);
      return mesh;
    } finally {
      if (currentSetMaterialInfo) factory.setMaterialInfo = currentSetMaterialInfo;
      Object.assign(factory, originalState);
    }
  };

  if (typeof previousSwapD4 === 'function') {
    box.swapDiceFace_D4 = (dicemesh: unknown, result: unknown) => {
      const descriptor = dicemesh && typeof dicemesh === 'object'
        ? d4Appearance.get(dicemesh as object)
        : undefined;
      if (!descriptor) return previousSwapD4.call(box, dicemesh, result);

      const originalState = captureFactoryState(factory);
      try {
        applyAppearanceFactoryState(factory, descriptor);
        const swapped = previousSwapD4.call(box, dicemesh, result);
        applyStaticSkinToMesh(dicemesh, descriptor);
        return swapped;
      } finally {
        Object.assign(factory, originalState);
      }
    };
  }

  return {
    effects,
    restore: () => {
      factory.create = originalCreate;
      if (originalSetMaterialInfo) factory.setMaterialInfo = originalSetMaterialInfo;
      if (previousSwapD4) box.swapDiceFace_D4 = previousSwapD4;
      effects.stop();
    },
  };
}
