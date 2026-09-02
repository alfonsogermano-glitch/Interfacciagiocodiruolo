import { ICON_DATA } from '../shared/tiptapIconData';
import { layoutCustomDieFaceText } from './diceCustomDie.ts';
import type { Dice3DCustomMaterial, Dice3DProjectionChunk } from './dice3dProjection.ts';
import type { CustomDieFace, CustomDiePhysicalRole, CustomDieRollSnapshot } from './diceTypes.ts';

type DicePresetLike = {
  shape: string;
  labels: unknown[];
  normals?: unknown[];
};

type DiceTextMaterialDiceLike = {
  shape?: string;
};

type DiceTextureCanvasLike = {
  width: number;
  height: number;
  getContext: (contextId: '2d') => CanvasRenderingContext2D | null;
};

type DiceTextureLike = {
  image?: DiceTextureCanvasLike;
  needsUpdate?: boolean;
};

type DiceTextMaterialResultLike = {
  composite?: DiceTextureLike;
  bump?: DiceTextureLike | null;
};

type DiceCreateTextMaterial = (
  diceobj: DiceTextMaterialDiceLike,
  labels: unknown[],
  index: number,
  size: number,
  margin: number,
  texture?: unknown,
  forecolor?: string,
  outlinecolor?: string,
  backcolor?: string,
  allowcache?: boolean,
) => DiceTextMaterialResultLike;

type DiceFactoryLike = {
  create: (type: string) => unknown;
  get: (type: string) => DicePresetLike | null;
  setMaterialInfo?: () => void;
  createTextMaterial?: DiceCreateTextMaterial;
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
  swapDiceFace_D4?: (dicemesh: unknown, result: unknown) => unknown;
};

type CustomD4TextLabel = {
  kind: 'hollowgate-custom-d4-text';
  text: string;
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
const CUSTOM_FACE_D4_TEXT_WRAP_THRESHOLD = 30;
const CUSTOM_FACE_D4_TEXT_CENTER_Y = 62;
const D4_UPSTREAM_IMAGE_X = 100 / 256;
const D4_UPSTREAM_IMAGE_Y = 25 / 256;
const D4_UPSTREAM_IMAGE_SIZE = 60 / 256;

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

function splitCustomD4TextLine(value: string): string | null {
  const characters = [...value];
  if (characters.length < 2) return null;

  const midpoint = characters.length / 2;
  let splitIndex = Math.ceil(midpoint);
  let consumeWhitespace = false;
  let bestDistance = Number.POSITIVE_INFINITY;

  characters.forEach((character, index) => {
    if (index === 0 || index === characters.length - 1 || !/\s/.test(character)) return;
    const distance = Math.abs(index - midpoint);
    if (distance >= bestDistance) return;
    splitIndex = index;
    consumeWhitespace = true;
    bestDistance = distance;
  });

  const firstLine = characters.slice(0, splitIndex).join('').trimEnd();
  const secondLine = characters.slice(splitIndex + (consumeWhitespace ? 1 : 0)).join('').trimStart();
  return firstLine && secondLine ? `${firstLine}\n${secondLine}` : null;
}

export function layoutCustomD4FaceText(text: string) {
  const normalizedText = text.replace(/\r\n?/g, '\n');
  let layout = layoutCustomDieFaceText(normalizedText);

  // dice-box-threejs paints three labels around the three d4 vertices. A word
  // that is merely scaled to fit one line becomes unreadably small in that slot,
  // so prefer a balanced two-line block before it drops below a readable size.
  if (!normalizedText.includes('\n') && layout.lines.length === 1 && layout.fontSize < CUSTOM_FACE_D4_TEXT_WRAP_THRESHOLD) {
    const balancedText = splitCustomD4TextLine(layout.lines[0]);
    if (balancedText) layout = layoutCustomDieFaceText(balancedText);
  }

  const singleLine = layout.lines.length === 1;
  const fontSize = Math.min(
    singleLine ? 56 : 36,
    Math.round(layout.fontSize * (singleLine ? 1.16 : 1.1)),
  );
  const lineYs = singleLine
    ? [CUSTOM_FACE_D4_TEXT_CENTER_Y]
    : [
      CUSTOM_FACE_D4_TEXT_CENTER_Y - fontSize * 0.55,
      CUSTOM_FACE_D4_TEXT_CENTER_Y + fontSize * 0.55,
    ];

  return { ...layout, fontSize, lineYs };
}

function isCustomD4TextLabel(value: unknown): value is CustomD4TextLabel {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CustomD4TextLabel>;
  return candidate.kind === 'hollowgate-custom-d4-text' && typeof candidate.text === 'string';
}

function drawCustomD4TextLabels(
  material: DiceTextMaterialResultLike,
  labels: readonly unknown[],
  color: string,
): void {
  const canvas = material.composite?.image;
  if (!canvas || typeof canvas.getContext !== 'function' || canvas.width <= 0) return;
  const context = canvas.getContext('2d');
  if (!context) return;

  const textureSize = canvas.width;
  const rotationX = textureSize / 2;
  const rotationY = textureSize / 2;
  const slotX = textureSize * D4_UPSTREAM_IMAGE_X;
  const slotY = textureSize * D4_UPSTREAM_IMAGE_Y;
  const slotSize = textureSize * D4_UPSTREAM_IMAGE_SIZE;
  const textX = slotX + slotSize / 2;

  context.save();
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = color;

  labels.forEach((label) => {
    if (isCustomD4TextLabel(label)) {
      const layout = layoutCustomD4FaceText(label.text);
      const fontSize = Math.max(1, (layout.fontSize / 100) * slotSize);
      context.font = `800 ${fontSize}px Arial, Helvetica, sans-serif`;
      layout.lines.forEach((line, lineIndex) => {
        const lineY = layout.lineYs[lineIndex] ?? 50;
        const textY = slotY + (lineY / 100) * slotSize;
        context.fillText(line, textX, textY);
      });
    }

    context.translate(rotationX, rotationY);
    context.rotate(Math.PI * 2 / 3);
    context.translate(-rotationX, -rotationY);
  });

  context.restore();
  if (material.composite) material.composite.needsUpdate = true;
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

async function faceLabel(
  face: CustomDieFace,
  symbolColor: string,
  physicalSides: number,
): Promise<unknown> {
  if (physicalSides === 4 && face.visual.kind === 'text') {
    return { kind: 'hollowgate-custom-d4-text', text: face.visual.text } satisfies CustomD4TextLabel;
  }

  const sourceUrl = face.visual.kind === 'icon'
    ? buildCustomIconSvgDataUrl(face.visual.iconName, symbolColor)
    : face.visual.kind === 'text'
      ? buildCustomTextSvgDataUrl(face.visual.text, symbolColor)
      : face.visual.publicUrl;
  const source = await loadImage(sourceUrl);
  const contentRatio = face.visual.kind === 'text'
    ? CUSTOM_FACE_TEXT_CONTENT_RATIO
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
  const labels = await Promise.all(
    facesForRole(snapshot, role).map((face) => faceLabel(face, snapshot.symbolColor, physicalSides)),
  );
  if (physicalSides === 4) {
    const [a, b, c, d] = labels;
    return [
      [[], [0, 0, 0], [b, d, c], [a, c, d], [b, a, d], [a, b, c]],
      [[], [0, 0, 0], [b, c, d], [c, a, d], [b, d, a], [c, b, a]],
      [[], [0, 0, 0], [d, c, b], [c, d, a], [d, b, a], [c, a, b]],
      [[], [0, 0, 0], [d, b, c], [a, d, c], [d, a, b], [a, c, b]],
    ];
  }
  return physicalSides === 10 ? ['', ...labels] : ['', '', ...labels];
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

function captureFactoryMaterialState(factory: DiceFactoryLike) {
  return {
    dice_color: factory.dice_color,
    dice_color_rand: factory.dice_color_rand,
    edge_color_rand: factory.edge_color_rand,
    label_color_rand: factory.label_color_rand,
    label_outline_rand: factory.label_outline_rand,
    dice_texture: factory.dice_texture,
    dice_texture_rand: factory.dice_texture_rand,
    dice_material: factory.dice_material,
    dice_material_rand: factory.dice_material_rand,
    material_options: factory.material_options,
  };
}

function applyCustomFactoryMaterialState(factory: DiceFactoryLike, descriptor: Dice3DCustomMaterial) {
  factory.dice_color = descriptor.customDie.bodyColor;
  factory.dice_color_rand = descriptor.customDie.bodyColor;
  factory.edge_color_rand = descriptor.customDie.bodyColor;
  factory.label_color_rand = descriptor.customDie.symbolColor;
  factory.label_outline_rand = descriptor.customDie.symbolColor;
  const neutralTexture = { name: 'none', texture: null, bump: null, composite: 'source-over', material: 'none' };
  factory.dice_texture = neutralTexture;
  factory.dice_texture_rand = neutralTexture;
  factory.dice_material = 'none';
  factory.dice_material_rand = 'none';
  factory.material_options = { ...factory.material_options, color: 0xffffff };
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
  const originalCreateTextMaterial = typedFactory.createTextMaterial;
  const originalSwapDiceFaceD4 = box.swapDiceFace_D4;
  const customD4Meshes = new WeakMap<object, PreparedCustomDiceMaterial>();

  if (originalCreateTextMaterial) {
    typedFactory.createTextMaterial = (
      diceobj,
      labels,
      index,
      size,
      margin,
      texture,
      forecolor,
      outlinecolor,
      backcolor,
      allowcache,
    ) => {
      const current = diceobj.shape === 'd4' && Array.isArray(labels[index])
        ? labels[index] as unknown[]
        : null;
      if (!current?.some(isCustomD4TextLabel)) {
        return originalCreateTextMaterial.call(
          typedFactory,
          diceobj,
          labels,
          index,
          size,
          margin,
          texture,
          forecolor,
          outlinecolor,
          backcolor,
          allowcache,
        );
      }

      const sanitizedLabels = labels.slice();
      sanitizedLabels[index] = current.map((label) => isCustomD4TextLabel(label) ? '' : label);
      const material = originalCreateTextMaterial.call(
        typedFactory,
        diceobj,
        sanitizedLabels,
        index,
        size,
        margin,
        texture,
        forecolor,
        outlinecolor,
        backcolor,
        false,
      );
      drawCustomD4TextLabels(
        material,
        current,
        forecolor ?? typedFactory.label_color_rand ?? '#ffffff',
      );
      return material;
    };
  }

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
    const originalColors = captureFactoryMaterialState(typedFactory);

    preset.labels = ready.labels;
    preset.normals = [];
    typedFactory.materials_cache = {};
    if (originalSetMaterialInfo) {
      typedFactory.setMaterialInfo = () => {
        originalSetMaterialInfo();
        applyCustomFactoryMaterialState(typedFactory, descriptor);
      };
    }

    try {
      const mesh = originalCreate(type);
      if (preset.shape === 'd4' && mesh && typeof mesh === 'object') {
        customD4Meshes.set(mesh as object, ready);
      }
      return mesh;
    } finally {
      preset.labels = originalLabels;
      preset.normals = originalNormals;
      if (originalSetMaterialInfo) typedFactory.setMaterialInfo = originalSetMaterialInfo;
      Object.assign(typedFactory, originalColors);
    }
  };

  // dice-box-threejs 0.0.12 has a d4-only forced-result path. After the
  // simulation it can call swapDiceFace_D4(), which regenerates materials
  // directly without calling setMaterialInfo(). Reapply the exact Custom
  // material state for that mesh so the forced remap cannot fall back to an
  // undefined/stale random texture state.
  if (typeof originalSwapDiceFaceD4 === 'function') {
    box.swapDiceFace_D4 = (dicemesh: unknown, result: unknown) => {
      const ready = dicemesh && typeof dicemesh === 'object'
        ? customD4Meshes.get(dicemesh as object)
        : undefined;
      if (!ready) return originalSwapDiceFaceD4.call(box, dicemesh, result);

      const preset = typedFactory.get('d4');
      if (!preset) return originalSwapDiceFaceD4.call(box, dicemesh, result);

      const originalLabels = preset.labels;
      const originalNormals = preset.normals;
      const originalColors = captureFactoryMaterialState(typedFactory);
      const originalSetMaterialInfo = typedFactory.setMaterialInfo?.bind(typedFactory);

      try {
        originalSetMaterialInfo?.();
        preset.labels = ready.labels;
        preset.normals = [];
        typedFactory.materials_cache = {};
        applyCustomFactoryMaterialState(typedFactory, ready.descriptor);
        return originalSwapDiceFaceD4.call(box, dicemesh, result);
      } finally {
        preset.labels = originalLabels;
        preset.normals = originalNormals;
        Object.assign(typedFactory, originalColors);
      }
    };
  }

  return () => {
    typedFactory.create = originalCreate;
    if (originalCreateTextMaterial) typedFactory.createTextMaterial = originalCreateTextMaterial;
    if (originalSwapDiceFaceD4) box.swapDiceFace_D4 = originalSwapDiceFaceD4;
    if (originalLighting.spot !== undefined) box.light?.color?.set?.(originalLighting.spot);
    if (originalLighting.hemisphereSky !== undefined) box.light_amb?.color?.set?.(originalLighting.hemisphereSky);
    if (originalLighting.hemisphereGround !== undefined) box.light_amb?.groundColor?.set?.(originalLighting.hemisphereGround);
  };
}
