import { ICON_DATA } from '../shared/tiptapIconData';
import { layoutCustomDieFaceText } from './diceCustomDie.ts';
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
  dice_texture?: unknown;
  dice_texture_rand?: unknown;
  dice_material?: unknown;
  dice_material_rand?: unknown;
  material_options?: Record<string, unknown>;
  materials_cache?: Record<string, unknown>;
};

type DiceColorLike = {
  getHex?: () => number;
  set?: (value: number | string) => unknown;
};

type DiceBoxWithFactory = {
  DiceFactory?: unknown;
  light?: { color?: DiceColorLike };
  light_amb?: { color?: DiceColorLike; groundColor?: DiceColorLike };
};

export interface PreparedCustomDiceMaterial {
  descriptor: Dice3DCustomMaterial;
  labels: unknown[];
}

const CUSTOM_FACE_TEXTURE_SIZE = 256;
// HTMLImageElement labels are stretched over the whole upstream texture canvas.
// Keep custom artwork inside a centered safe area large enough to stay readable
// while leaving a clear border from the physical face edges.
const CUSTOM_FACE_STANDARD_CONTENT_RATIO = 0.52;
const CUSTOM_FACE_TEXT_CONTENT_RATIO = 0.72;
// d4 has its own image-placement path and already shrinks custom images internally.
const CUSTOM_FACE_D4_CONTENT_RATIO = 0.9;
const CUSTOM_FACE_D4_TEXT_CONTENT_RATIO = 0.95;

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
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" fill="none" stroke="${escapeXml(color)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function buildCustomTextSvgDataUrl(text: string, color: string): string {
  const layout = layoutCustomDieFaceText(text);
  const body = layout.lines.map((line, index) => `<text x="50" y="${layout.lineYs[index]}" text-anchor="middle" dominant-baseline="central" font-size="${layout.fontSize}" font-weight="700" font-family="Arial, Helvetica, sans-serif" fill="${escapeXml(color)}">${escapeXml(line)}</text>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">${body}</svg>`;
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

export async function normalizeCustomFaceImage(
  image: HTMLImageElement,
  contentRatio = CUSTOM_FACE_STANDARD_CONTENT_RATIO,
): Promise<HTMLImageElement> {
  const canvas = document.createElement('canvas');
  canvas.width = CUSTOM_FACE_TEXTURE_SIZE;
  canvas.height = CUSTOM_FACE_TEXTURE_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Impossibile preparare la texture del dado Custom.');

  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (sourceWidth <= 0 || sourceHeight <= 0) throw new Error('Dimensioni immagine del dado Custom non valide.');

  const drawableSize = CUSTOM_FACE_TEXTURE_SIZE * contentRatio;
  const scale = Math.min(drawableSize / sourceWidth, drawableSize / sourceHeight);
  const drawWidth = Math.max(1, sourceWidth * scale);
  const drawHeight = Math.max(1, sourceHeight * scale);
  const drawX = (CUSTOM_FACE_TEXTURE_SIZE - drawWidth) / 2;
  const drawY = (CUSTOM_FACE_TEXTURE_SIZE - drawHeight) / 2;

  context.clearRect(0, 0, CUSTOM_FACE_TEXTURE_SIZE, CUSTOM_FACE_TEXTURE_SIZE);
  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  return loadImage(canvas.toDataURL('image/png'));
}

async function faceImage(
  face: CustomDieFace,
  symbolColor: string,
  physicalSides: number,
): Promise<HTMLImageElement> {
  const sourceUrl = face.visual.kind === 'icon'
    ? buildCustomIconSvgDataUrl(face.visual.iconName, symbolColor)
    : face.visual.kind === 'text'
      ? buildCustomTextSvgDataUrl(face.visual.text, symbolColor)
      : face.visual.publicUrl;
  const source = await loadImage(sourceUrl);
  const contentRatio = face.visual.kind === 'text'
    ? (physicalSides === 4 ? CUSTOM_FACE_D4_TEXT_CONTENT_RATIO : CUSTOM_FACE_TEXT_CONTENT_RATIO)
    : (physicalSides === 4 ? CUSTOM_FACE_D4_CONTENT_RATIO : CUSTOM_FACE_STANDARD_CONTENT_RATIO);
  return normalizeCustomFaceImage(source, contentRatio);
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
  const physicalSides = snapshot.sides === 100 ? 10 : snapshot.sides;
  const images = await Promise.all(
    facesForRole(snapshot, role).map((face) => faceImage(face, snapshot.symbolColor, physicalSides)),
  );
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

  // The upstream scene uses a warm spotlight and a yellow hemisphere light.
  // Neutralize them only for rolls containing Custom dice, then restore them.
  const originalLighting = {
    spot: box.light?.color?.getHex?.(),
    hemisphereSky: box.light_amb?.color?.getHex?.(),
    hemisphereGround: box.light_amb?.groundColor?.getHex?.(),
  };
  box.light?.color?.set?.(0xffffff);
  box.light_amb?.color?.set?.(0xffffff);
  box.light_amb?.groundColor?.set?.(0x676771);

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
      dice_texture: typedFactory.dice_texture,
      dice_texture_rand: typedFactory.dice_texture_rand,
      dice_material: typedFactory.dice_material,
      dice_material_rand: typedFactory.dice_material_rand,
      material_options: typedFactory.material_options,
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
        const neutralTexture = { name: 'none', texture: null, bump: null, composite: 'source-over', material: 'none' };
        typedFactory.dice_texture = neutralTexture;
        typedFactory.dice_texture_rand = neutralTexture;
        typedFactory.dice_material = 'none';
        typedFactory.dice_material_rand = 'none';
        typedFactory.material_options = { ...typedFactory.material_options, color: 0xffffff };
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
    if (originalLighting.spot !== undefined) box.light?.color?.set?.(originalLighting.spot);
    if (originalLighting.hemisphereSky !== undefined) box.light_amb?.color?.set?.(originalLighting.hemisphereSky);
    if (originalLighting.hemisphereGround !== undefined) box.light_amb?.groundColor?.set?.(originalLighting.hemisphereGround);
  };
}
