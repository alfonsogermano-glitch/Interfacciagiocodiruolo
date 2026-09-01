import { ICON_DATA } from '../shared/tiptapIconData';
import type { Dice3DCustomMaterial, Dice3DProjectionChunk } from './dice3dProjection.ts';
import type { CustomDieFace, CustomDiePhysicalRole, CustomDieRollSnapshot } from './diceTypes.ts';

type DicePresetLike = {
  shape: string;
  labels: unknown[];
  normals?: unknown[];
};

type DiceFactoryLike = {
  create: (type: string) => unknown;
  get: (type: string) => DicePresetLike | null;
  setMaterialInfo?: () => void;
  dice_color?: string;
  dice_color_rand?: string;
  edge_color_rand?: string;
  label_color_rand?: string;
  label_outline_rand?: string;
  materials_cache?: Record<string, unknown>;
};

type DiceBoxWithFactory = { DiceFactory?: unknown };

export interface PreparedCustomDiceMaterial {
  descriptor: Dice3DCustomMaterial;
  labels: unknown[];
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character] ?? character);
}

export function buildCustomIconSvgDataUrl(iconName: string, color: string): string {
  const primitives = ICON_DATA[iconName];
  if (!primitives) throw new Error(`Icona Hollowgate non disponibile: ${iconName}.`);
  const body = primitives.map(([tag, attrs]) => {
    const serialized = Object.entries(attrs).map(([key, value]) => {
      const attribute = key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
      return `${attribute}="${escapeXml(String(value))}"`;
    }).join(' ');
    return `<${tag} ${serialized}/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="-2 -2 28 28" preserveAspectRatio="xMidYMid meet" fill="none" stroke="${escapeXml(color)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Impossibile caricare una texture del dado Custom.'));
    image.src = source;
  });
}

async function faceImage(face: CustomDieFace, symbolColor: string): Promise<HTMLImageElement> {
  return loadImage(face.visual.kind === 'icon'
    ? buildCustomIconSvgDataUrl(face.visual.iconName, symbolColor)
    : face.visual.publicUrl);
}

function facesForRole(snapshot: CustomDieRollSnapshot, role: CustomDiePhysicalRole): CustomDieFace[] {
  return snapshot.faces
    .filter((face) => face.role === role)
    .sort((a, b) => a.index - b.index);
}

/** Produces the exact label arrays used internally by dice-box-threejs. */
export async function buildCustomFaceLabels(
  snapshot: CustomDieRollSnapshot,
  role: CustomDiePhysicalRole,
): Promise<unknown[]> {
  const images = await Promise.all(facesForRole(snapshot, role).map((face) => faceImage(face, snapshot.symbolColor)));
  const physicalSides = snapshot.sides === 100 ? 10 : snapshot.sides;
  if (physicalSides === 4) {
    const [a, b, c, d] = images;
    return [
      [[], [0, 0, 0], [b, d, c], [a, c, d], [b, a, d], [a, b, c]],
      [[], [0, 0, 0], [b, c, d], [c, a, d], [b, d, a], [c, b, a]],
      [[], [0, 0, 0], [d, c, b], [c, d, a], [d, b, a], [c, a, b]],
      [[], [0, 0, 0], [d, b, c], [a, d, c], [d, a, b], [a, c, b]],
    ];
  }
  return physicalSides === 10 ? ['', ...images] : ['', '', ...images];
}

export function buildSimultaneousMaterialQueue(chunks: Dice3DProjectionChunk[]): Array<Dice3DCustomMaterial | null> {
  const grouped = new Map<number, Array<Dice3DCustomMaterial | null>>();
  for (const chunk of chunks) {
    const materials = chunk.customMaterials ?? chunk.values.map(() => null);
    const target = grouped.get(chunk.sides) ?? [];
    target.push(...materials);
    grouped.set(chunk.sides, target);
  }
  return [...grouped.values()].flat();
}

export async function installCustomDiceMaterialAdapter(
  box: DiceBoxWithFactory,
  queue: Array<Dice3DCustomMaterial | null>,
): Promise<() => void> {
  const candidateFactory = box.DiceFactory;
  if (!candidateFactory || typeof candidateFactory !== 'object') {
    throw new Error('Il renderer 3D non espone il factory richiesto per i dadi Custom.');
  }
  const factory = candidateFactory as Partial<DiceFactoryLike>;
  if (typeof factory.create !== 'function' || typeof factory.get !== 'function') {
    throw new Error('Il renderer 3D non espone il factory richiesto per i dadi Custom.');
  }

  const prepared = new Map<string, PreparedCustomDiceMaterial>();
  for (const descriptor of queue) {
    if (!descriptor) continue;
    const key = `${descriptor.customDie.id}:${descriptor.role}:${descriptor.customDie.updatedAt ?? ''}`;
    if (!prepared.has(key)) {
      prepared.set(key, { descriptor, labels: await buildCustomFaceLabels(descriptor.customDie, descriptor.role) });
    }
  }

  const typedFactory = factory as DiceFactoryLike;
  const originalCreate = typedFactory.create.bind(typedFactory);
  let queueIndex = 0;
  typedFactory.create = (type: string) => {
    const descriptor = queue[queueIndex++] ?? null;
    if (!descriptor) return originalCreate(type);

    const preset = typedFactory.get(type);
    if (!preset) return originalCreate(type);
    const key = `${descriptor.customDie.id}:${descriptor.role}:${descriptor.customDie.updatedAt ?? ''}`;
    const ready = prepared.get(key);
    if (!ready) return originalCreate(type);

    const originalLabels = preset.labels;
    const originalNormals = preset.normals;
    const originalSetMaterialInfo = typedFactory.setMaterialInfo?.bind(typedFactory);
    const originalColors = {
      dice_color: typedFactory.dice_color,
      dice_color_rand: typedFactory.dice_color_rand,
      edge_color_rand: typedFactory.edge_color_rand,
      label_color_rand: typedFactory.label_color_rand,
      label_outline_rand: typedFactory.label_outline_rand,
    };

    preset.labels = ready.labels;
    preset.normals = [];
    typedFactory.materials_cache = {};
    if (originalSetMaterialInfo) {
      typedFactory.setMaterialInfo = () => {
        originalSetMaterialInfo();
        typedFactory.dice_color = descriptor.customDie.bodyColor;
        typedFactory.dice_color_rand = descriptor.customDie.bodyColor;
        typedFactory.edge_color_rand = descriptor.customDie.bodyColor;
        typedFactory.label_color_rand = descriptor.customDie.symbolColor;
        typedFactory.label_outline_rand = descriptor.customDie.symbolColor;
      };
    }

    try {
      return originalCreate(type);
    } finally {
      preset.labels = originalLabels;
      preset.normals = originalNormals;
      if (originalSetMaterialInfo) typedFactory.setMaterialInfo = originalSetMaterialInfo;
      Object.assign(typedFactory, originalColors);
    }
  };

  return () => {
    typedFactory.create = originalCreate;
  };
}
