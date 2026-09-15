import { getDice3DTextureDescriptor } from './dice3dSkinTextures.ts';
import { Dice3DSkinEffectController } from './dice3dSkinEffects.ts';
import { applyDice3DSurfaceProfile, getDice3DSurfaceProfile } from './dice3dSurfaceProfiles.ts';
import { installDice3DVisualBoost } from './dice3dVisualBoost.ts';
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
  materials_cache?: Record<string, unknown>;
};

type DiceBoxLike = { DiceFactory?: unknown; swapDiceFace_D4?: (dicemesh: unknown, result: unknown) => unknown };
type ColorLike = { set?: (value: string | number) => unknown };
type TextureLike = {
  anisotropy?: number;
  generateMipmaps?: boolean;
  needsUpdate?: boolean;
};
type MaterialLike = {
  color?: ColorLike;
  map?: TextureLike | null;
  roughness?: number;
  metalness?: number;
  shininess?: number;
  opacity?: number;
  transparent?: boolean;
  emissive?: ColorLike;
  emissiveMap?: TextureLike | null;
  emissiveIntensity?: number;
  needsUpdate?: boolean;
};
type MeshLike = { material?: MaterialLike | MaterialLike[] };

const NEUTRAL_TEXTURE = { name: 'none', texture: null, bump: null, composite: 'source-over', material: 'none' } as const;
const MIN_TEXTURED_LABEL_CONTRAST = 7;
const FIRE_FACE_EMISSIVE_INTENSITY = 0.18;
const TEXTURED_FACE_ANISOTROPY = 8;
const DICE_SKIN_LABEL_OUTLINE_WIDTH = 8;
const PHOTO_UNLIT_LABEL_OUTLINE_MIN_WIDTH = 18;
const PHOTO_UNLIT_LABEL_OUTLINE_MAX_WIDTH = 32;
const PHOTO_UNLIT_LABEL_OUTLINE_FONT_RATIO = 0.09;

function captureFactoryState(factory: DiceFactoryLike) {
  return {
    dice_color: factory.dice_color, dice_color_rand: factory.dice_color_rand, edge_color: factory.edge_color, edge_color_rand: factory.edge_color_rand,
    label_color: factory.label_color, label_color_rand: factory.label_color_rand, label_outline: factory.label_outline, label_outline_rand: factory.label_outline_rand,
    dice_texture: factory.dice_texture, dice_texture_rand: factory.dice_texture_rand, dice_material: factory.dice_material, dice_material_rand: factory.dice_material_rand,
    material_options: factory.material_options,
  };
}

function dice3DLabelOutlineWidth(
  context: CanvasRenderingContext2D,
  descriptor: Dice3DAppearanceDescriptor,
): number {
  const skinId = descriptor.appearance.skinId;
  if (getDice3DSurfaceProfile(skinId) !== 'photo-unlit' && skinId !== 'stone' && skinId !== 'metal' && skinId !== 'obsidian') return DICE_SKIN_LABEL_OUTLINE_WIDTH;
  const fontSize = Number.parseFloat(context.font);
  const proportionalWidth = Number.isFinite(fontSize)
    ? fontSize * PHOTO_UNLIT_LABEL_OUTLINE_FONT_RATIO
    : PHOTO_UNLIT_LABEL_OUTLINE_MIN_WIDTH;
  const base = Math.min(
    PHOTO_UNLIT_LABEL_OUTLINE_MAX_WIDTH,
    Math.max(PHOTO_UNLIT_LABEL_OUTLINE_MIN_WIDTH, proportionalWidth),
  );
  // Metallo: numeri bianchi su foto chiara, il caso peggiore per contrasto.
  // Contorno piu' marcato cosi' restano leggibili anche a faccia luminosa.
  // Solo metallo: le altre skin restano invariate.
  return skinId === 'metal' ? Math.min(48, base * 1.4) : base;
}

// Il d4 di dice-box disegna tre etichette per faccia a 24pt ogni 128px di
// texture (contro ~170pt del d20 a numero singolo): numeri, icone e note
// restano piccoli e poco leggibili. Questo boost li ingrandisce solo per il
// d4, lasciando invariate le texture fotografiche a pieno canvas.
export const D4_LABEL_FONT_SCALE = 1.5;
export const D4_LABEL_IMAGE_SCALE = 1.5;
const D4_LABEL_IMAGE_FULL_CANVAS_RATIO = 0.9;

function scaledD4LabelFont(font: string): string | null {
  // Il canvas normalizza le unita' in lettura ("96pt" diventa "128px"):
  // si accettano entrambe e si conserva l'unita' originale.
  const match = font.match(/(\d+(?:\.\d+)?)(pt|px)(\s|$)/);
  if (!match) return null;
  const scaled = Number.parseFloat(match[1]) * D4_LABEL_FONT_SCALE;
  if (!Number.isFinite(scaled)) return null;
  return font.replace(match[0], `${scaled}${match[2]}${match[3]}`);
}

// Profondita' di annidamento del boost d4: gli adapter appearance e custom
// si avvolgono a vicenda sullo stesso factory, quindi il patch scatta una
// sola volta per ogni disegno nativo. Il disegno custom esplicito (dimensioni
// gia' calcolate, con cap anti-sovrapposizione) gira invece con
// withoutD4LabelBoost, che ripristina davvero i metodi originali: basta
// impedire il re-patch non basterebbe, perche' il patch esterno resterebbe
// attivo e ri-scalerebbe il disegno esplicito una seconda volta.
let d4LabelBoostDepth = 0;
let d4BoostRestoredOriginals: {
  fillText: CanvasRenderingContext2D['fillText'];
  strokeText: CanvasRenderingContext2D['strokeText'];
  drawImage: CanvasRenderingContext2D['drawImage'];
} | null = null;

export function withoutD4LabelBoost<T>(work: () => T): T {
  if (typeof CanvasRenderingContext2D === 'undefined' || d4LabelBoostDepth === 0 || !d4BoostRestoredOriginals) return work();
  const prototype = CanvasRenderingContext2D.prototype;
  const patched = {
    fillText: prototype.fillText,
    strokeText: prototype.strokeText,
    drawImage: prototype.drawImage,
  };
  prototype.fillText = d4BoostRestoredOriginals.fillText;
  prototype.strokeText = d4BoostRestoredOriginals.strokeText;
  prototype.drawImage = d4BoostRestoredOriginals.drawImage;
  try {
    return work();
  } finally {
    prototype.fillText = patched.fillText;
    prototype.strokeText = patched.strokeText;
    prototype.drawImage = patched.drawImage;
  }
}

export function runWithD4LabelBoost<T>(diceType: string | undefined, work: () => T): T {
  if (diceType !== 'd4' || typeof CanvasRenderingContext2D === 'undefined' || d4LabelBoostDepth > 0) return work();
  d4LabelBoostDepth += 1;
  const prototype = CanvasRenderingContext2D.prototype;
  const originalFillText = prototype.fillText;
  const originalStrokeText = prototype.strokeText;
  const originalDrawImage = prototype.drawImage;

  d4BoostRestoredOriginals = {
    fillText: originalFillText,
    strokeText: originalStrokeText,
    drawImage: originalDrawImage,
  };

  prototype.fillText = function (
    this: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth?: number,
  ): void {
    const previousFont = this.font;
    const scaledFont = scaledD4LabelFont(previousFont);
    if (scaledFont) this.font = scaledFont;
    try {
      if (typeof maxWidth === 'number') originalFillText.call(this, text, x, y, maxWidth);
      else originalFillText.call(this, text, x, y);
    } finally {
      this.font = previousFont;
    }
  };

  prototype.strokeText = function (
    this: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth?: number,
  ): void {
    const previousFont = this.font;
    const scaledFont = scaledD4LabelFont(previousFont);
    if (scaledFont) this.font = scaledFont;
    try {
      if (typeof maxWidth === 'number') originalStrokeText.call(this, text, x, y, maxWidth);
      else originalStrokeText.call(this, text, x, y);
    } finally {
      this.font = previousFont;
    }
  };

  prototype.drawImage = function (
    this: CanvasRenderingContext2D,
    ...args: any[]
  ): void {
    const canvasWidth = this.canvas?.width ?? 0;
    const canvasHeight = this.canvas?.height ?? 0;
    // Forme drawImage: (img, dx, dy) | (img, dx, dy, dw, dh) |
    // (img, sx, sy, sw, sh, dx, dy, dw, dh). Si ingrandisce solo il contenuto
    // piccolo (icone d4) attorno al suo centro; le texture a pieno canvas
    // (fotografie, bump) restano invariate.
    if (args.length >= 4 && canvasWidth > 0 && canvasHeight > 0) {
      const dw = args[args.length - 2] as number;
      const dh = args[args.length - 1] as number;
      const dx = args[args.length - 4] as number;
      const dy = args[args.length - 3] as number;
      if (typeof dx === 'number' && typeof dy === 'number'
        && typeof dw === 'number' && typeof dh === 'number'
        && dw > 0 && dh > 0
        && dw < canvasWidth * D4_LABEL_IMAGE_FULL_CANVAS_RATIO
        && dh < canvasHeight * D4_LABEL_IMAGE_FULL_CANVAS_RATIO) {
        const scaledWidth = dw * D4_LABEL_IMAGE_SCALE;
        const scaledHeight = dh * D4_LABEL_IMAGE_SCALE;
        args[args.length - 4] = dx + (dw - scaledWidth) / 2;
        args[args.length - 3] = dy + (dh - scaledHeight) / 2;
        args[args.length - 2] = scaledWidth;
        args[args.length - 1] = scaledHeight;
      }
    }
    (originalDrawImage as (...callArgs: any[]) => void).apply(this, args);
  };

  try {
    return work();
  } finally {
    prototype.fillText = originalFillText;
    prototype.strokeText = originalStrokeText;
    prototype.drawImage = originalDrawImage;
    d4BoostRestoredOriginals = null;
    d4LabelBoostDepth -= 1;
  }
}

function runWithDice3DLabelOutlineBoost<T>(descriptor: Dice3DAppearanceDescriptor, work: () => T): T {
  if (typeof CanvasRenderingContext2D === 'undefined') return work();
  const prototype = CanvasRenderingContext2D.prototype;
  const originalStrokeText = prototype.strokeText;

  prototype.strokeText = function (
    this: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth?: number,
  ): void {
    const previousLineWidth = this.lineWidth;
    this.lineWidth = Math.max(previousLineWidth, dice3DLabelOutlineWidth(this, descriptor));
    try {
      if (typeof maxWidth === 'number') originalStrokeText.call(this, text, x, y, maxWidth);
      else originalStrokeText.call(this, text, x, y);
    } finally {
      this.lineWidth = previousLineWidth;
    }
  };
  try {
    return work();
  } finally {
    prototype.strokeText = originalStrokeText;
  }
}

function shouldBoostDice3DLabelOutline(descriptor: Dice3DAppearanceDescriptor): boolean {
  return !descriptor.custom && descriptor.appearance.skinId !== 'none';
}

function parseHexColor(color: string): [number, number, number] {
  const normalized = /^#[0-9a-f]{6}$/i.test(color) ? color.slice(1) : 'ffffff';
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

function colorToHex(red: number, green: number, blue: number): string {
  const part = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
  return `#${part(red)}${part(green)}${part(blue)}`;
}

function mixHexColor(base: string, target: string, amount: number): string {
  const from = parseHexColor(base);
  const to = parseHexColor(target);
  return colorToHex(
    from[0] + (to[0] - from[0]) * amount,
    from[1] + (to[1] - from[1]) * amount,
    from[2] + (to[2] - from[2]) * amount,
  );
}

function relativeLuminance(color: string): number {
  const channels = parseHexColor(color).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(a: string, b: string): number {
  const light = Math.max(relativeLuminance(a), relativeLuminance(b));
  const dark = Math.min(relativeLuminance(a), relativeLuminance(b));
  return (light + 0.05) / (dark + 0.05);
}

function estimatedTexturedBackground(bodyColor: string, skinId: Dice3DAppearanceDescriptor['appearance']['skinId']): string {
  switch (skinId) {
    case 'fire': return mixHexColor('#202329', bodyColor, 0.18);
    case 'obsidian': return mixHexColor(bodyColor, '#000000', 0.52);
    case 'stone': return mixHexColor(bodyColor, '#000000', 0.2);
    default: return bodyColor;
  }
}

export function getReadable3DLabelColor(
  symbolColor: string,
  bodyColor: string,
  skinId: Dice3DAppearanceDescriptor['appearance']['skinId'],
): string {
  if (skinId === 'none') return symbolColor;
  if (skinId === 'fire' || skinId === 'stone' || skinId === 'metal' || skinId === 'obsidian' || getDice3DSurfaceProfile(skinId) === 'photo-unlit') return symbolColor;
  const background = estimatedTexturedBackground(bodyColor, skinId);
  if (contrastRatio(symbolColor, background) >= MIN_TEXTURED_LABEL_CONTRAST) return symbolColor;

  const target = relativeLuminance(background) < 0.42 ? '#ffffff' : '#080b10';
  for (const amount of [0.45, 0.6, 0.75, 0.9, 1]) {
    const candidate = mixHexColor(symbolColor, target, amount);
    if (contrastRatio(candidate, background) >= MIN_TEXTURED_LABEL_CONTRAST) return candidate;
  }
  return target;
}

function readableOutlineColor(color: string): string {
  return relativeLuminance(color) > 0.58 ? '#080b10' : '#ffffff';
}

function applyAppearanceFactoryState(factory: DiceFactoryLike, descriptor: Dice3DAppearanceDescriptor) {
  const appearance = descriptor.appearance;
  const labelColor = getReadable3DLabelColor(appearance.symbolColor, appearance.bodyColor, appearance.skinId);
  const outlineColor = readableOutlineColor(labelColor);
  const faceColor = appearance.skinId === 'none' ? appearance.bodyColor : '#ffffff';
  factory.dice_color = faceColor;
  factory.dice_color_rand = faceColor;
  factory.edge_color = appearance.bodyColor;
  factory.edge_color_rand = appearance.bodyColor;
  factory.label_color = labelColor;
  factory.label_color_rand = labelColor;
  factory.label_outline = outlineColor;
  factory.label_outline_rand = outlineColor;

  let texture: unknown = NEUTRAL_TEXTURE;
  try { texture = getDice3DTextureDescriptor(appearance); }
  catch (error) { console.error('Texture skin 3D non disponibile, uso il materiale neutro:', error); }
  factory.dice_texture = texture;
  factory.dice_texture_rand = texture;
  factory.dice_material = 'none';
  factory.dice_material_rand = 'none';
  factory.material_options = { ...factory.material_options, color: 0xffffff };
}

function materialsOf(mesh: MeshLike): MaterialLike[] {
  if (!mesh.material) return [];
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function preserveFireFaceTexture(material: MaterialLike) {
  material.color?.set?.(0xffffff);
  if (!material.map) return;

  material.map.anisotropy = Math.max(material.map.anisotropy ?? 1, TEXTURED_FACE_ANISOTROPY);
  material.map.generateMipmaps = true;
  material.map.needsUpdate = true;

  if (material.emissive?.set) {
    material.emissive.set(0xffffff);
    material.emissiveMap = material.map;
    material.emissiveIntensity = FIRE_FACE_EMISSIVE_INTENSITY;
  }
}

function preserveStoneFaceTexture(material: MaterialLike) {
  material.color?.set?.(0xffffff);
  if (!material.map) return;
  material.map.anisotropy = Math.max(material.map.anisotropy ?? 1, TEXTURED_FACE_ANISOTROPY);
  material.map.generateMipmaps = true;
  material.map.needsUpdate = true;
  material.roughness = 0.9;
  material.metalness = 0;
  material.shininess = 8;
}

function prepareUnlitPhotoFaceTexture(material: MaterialLike) {
  material.color?.set?.(0xffffff);
  if (!material.map) return;
  material.map.anisotropy = Math.max(material.map.anisotropy ?? 1, TEXTURED_FACE_ANISOTROPY);
  material.map.generateMipmaps = true;
  material.map.needsUpdate = true;
}

function blendValue(current: number, target: number, factor: number): number { return current + (target - current) * factor; }
function edgeGlowColor(skinId: Dice3DAppearanceDescriptor['appearance']['skinId']): string | null {
  switch (skinId) {
    case 'fire': return '#ff5518'; case 'ice': return '#8eeeff'; case 'lightning': return '#42dcff'; case 'poison': return '#62d94d'; case 'obsidian': return '#8158e8'; case 'arcane': return '#b958f2'; default: return null;
  }
}

function applyStaticSkinToMesh(mesh: unknown, descriptor: Dice3DAppearanceDescriptor) {
  if (!mesh || typeof mesh !== 'object') return;
  const skinId = descriptor.appearance.skinId;
  if (skinId === 'none') return;
  materialsOf(mesh as MeshLike).forEach((material, materialIndex) => {
    const isEdgeMaterial = materialIndex === 0;
    const strength = isEdgeMaterial ? 1 : 0;
    const applyRoughness = (target: number) => { if (typeof material.roughness === 'number') material.roughness = blendValue(material.roughness, target, strength); };
    const applyMetalness = (target: number) => { if (typeof material.metalness === 'number') material.metalness = blendValue(material.metalness, target, strength); };
    const applyShininess = (target: number) => { if (typeof material.shininess === 'number') material.shininess = blendValue(material.shininess, target, strength); };
    if (!isEdgeMaterial) {
      if (skinId === 'fire' && !descriptor.custom) preserveFireFaceTexture(material);
      if (skinId === 'stone' && !descriptor.custom) preserveStoneFaceTexture(material);
      if ((skinId === 'metal' || skinId === 'obsidian') && !descriptor.custom) prepareUnlitPhotoFaceTexture(material);
      if (typeof material.opacity === 'number') material.opacity = 1;
      material.transparent = false;
      material.needsUpdate = true;
      return;
    }
    switch (skinId) {
      case 'fire': applyRoughness(0.58); applyShininess(46); break;
      case 'ice': applyRoughness(0.16); applyMetalness(0.03); applyShininess(126); break;
      case 'lightning': applyRoughness(0.22); applyShininess(112); break;
      case 'poison': applyRoughness(0.4); applyShininess(62); break;
      case 'stone': applyRoughness(0.96); applyMetalness(0); applyShininess(4); break;
      case 'metal': applyRoughness(0.34); applyMetalness(0.72); applyShininess(96); break;
      case 'obsidian': applyRoughness(0.14); applyMetalness(0.08); applyShininess(142); break;
      case 'arcane': applyRoughness(0.25); applyShininess(104); break;
    }
    const glowColor = edgeGlowColor(skinId);
    if (glowColor && material.emissive && typeof material.emissive.set === 'function') {
      material.emissive.set(glowColor);
      if (typeof material.emissiveIntensity === 'number') material.emissiveIntensity = skinId === 'ice' ? 0.25 : 0.11;
    }
    material.needsUpdate = true;
  });
}

export function buildSimultaneousAppearanceQueue(chunks: Dice3DProjectionChunk[]): Array<Dice3DAppearanceDescriptor | null> {
  const grouped = new Map<number, Array<Dice3DAppearanceDescriptor | null>>();
  for (const chunk of chunks) {
    const appearances = chunk.appearances ?? chunk.values.map(() => null);
    const target = grouped.get(chunk.sides) ?? [];
    target.push(...appearances);
    grouped.set(chunk.sides, target);
  }
  return [...grouped.values()].flat();
}

export function installDiceAppearanceAdapter(box: DiceBoxLike, queue: Array<Dice3DAppearanceDescriptor | null>): { restore: () => void; effects: Dice3DSkinEffectController } {
  const candidateFactory = box.DiceFactory;
  if (!candidateFactory || typeof candidateFactory !== 'object') throw new Error('Il renderer 3D non espone il factory richiesto per la personalizzazione.');
  const factory = candidateFactory as DiceFactoryLike;
  if (typeof factory.create !== 'function') throw new Error('Il renderer 3D non espone il factory richiesto per la personalizzazione.');

  const originalCreate = factory.create.bind(factory);
  const originalSetMaterialInfo = factory.setMaterialInfo?.bind(factory);
  const previousSwapD4 = box.swapDiceFace_D4;
  const d4Appearance = new WeakMap<object, Dice3DAppearanceDescriptor>();
  const effects = new Dice3DSkinEffectController();
  const visualBoostCleanups: Array<() => void> = [];
  const settledFlag = { value: false };
  let queueIndex = 0;

  factory.create = (type: string) => {
    const descriptor = queue[queueIndex++] ?? null;
    if (!descriptor) return originalCreate(type);
    const originalState = captureFactoryState(factory);
    const currentSetMaterialInfo = factory.setMaterialInfo?.bind(factory);
    if (currentSetMaterialInfo) {
      factory.setMaterialInfo = () => { currentSetMaterialInfo(); applyAppearanceFactoryState(factory, descriptor); };
    }
    try {
      applyAppearanceFactoryState(factory, descriptor);
      const mesh = runWithD4LabelBoost(type, () => (shouldBoostDice3DLabelOutline(descriptor)
        ? runWithDice3DLabelOutlineBoost(descriptor, () => originalCreate(type))
        : originalCreate(type)));
      applyStaticSkinToMesh(mesh, descriptor);
      applyDice3DSurfaceProfile(mesh, descriptor);
      effects.registerMesh(mesh, descriptor);
      visualBoostCleanups.push(installDice3DVisualBoost(mesh, descriptor, () => settledFlag.value));
      if (type === 'd4' && mesh && typeof mesh === 'object') d4Appearance.set(mesh as object, descriptor);
      return mesh;
    } finally {
      if (currentSetMaterialInfo) factory.setMaterialInfo = currentSetMaterialInfo;
      Object.assign(factory, originalState);
    }
  };

  if (typeof previousSwapD4 === 'function') {
    box.swapDiceFace_D4 = (dicemesh: unknown, result: unknown) => {
      const descriptor = dicemesh && typeof dicemesh === 'object' ? d4Appearance.get(dicemesh as object) : undefined;
      if (!descriptor) return previousSwapD4.call(box, dicemesh, result);
      const originalState = captureFactoryState(factory);
      try {
        originalSetMaterialInfo?.();
        factory.materials_cache = {};
        applyAppearanceFactoryState(factory, descriptor);
        const swapped = runWithD4LabelBoost('d4', () => (shouldBoostDice3DLabelOutline(descriptor)
          ? runWithDice3DLabelOutlineBoost(descriptor, () => previousSwapD4.call(box, dicemesh, result))
          : previousSwapD4.call(box, dicemesh, result)));
        applyStaticSkinToMesh(dicemesh, descriptor);
        applyDice3DSurfaceProfile(dicemesh, descriptor);
        return swapped;
      } finally { Object.assign(factory, originalState); }
    };
  }

  const originalSettle = effects.settle.bind(effects);
  effects.settle = () => {
    settledFlag.value = true;
    originalSettle();
  };

  return {
    effects,
    restore: () => {
      factory.create = originalCreate;
      if (originalSetMaterialInfo) factory.setMaterialInfo = originalSetMaterialInfo;
      if (previousSwapD4) box.swapDiceFace_D4 = previousSwapD4;
      // Svuota la cache materiali tra un tiro e l'altro: trattiene un canvas
      // per ogni faccia mai composta e, a sessione lunga, esaurisce i contesti
      // 2D (dadi bianchi senza numeri). Stesso pattern gia' usato dallo swap d4.
      try {
        factory.materials_cache = {};
      } catch {
        // Cache non azzerabile: i vecchi canvas restano riusabili.
      }
      visualBoostCleanups.splice(0).forEach((cleanup) => cleanup());
      settledFlag.value = false;
      effects.stop();
    },
  };
}
