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
  image?: unknown;
  clone?: () => TextureLike;
  dispose?: () => void;
};
type ShaderLike = { fragmentShader: string; uniforms: Record<string, { value: unknown }> };
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
  onBeforeCompile?: (shader: ShaderLike) => void;
  customProgramCacheKey?: () => string;
  addEventListener?: (type: string, listener: () => void) => void;
  userData?: Record<string, unknown>;
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
const OBSIDIAN_OUTER_OUTLINE_EXTRA_WIDTH = 14;
const REFLECTIVE_OUTPUT_FRAGMENT_CHUNKS = ['#include <colorspace_fragment>', '#include <encodings_fragment>'] as const;
const REFLECTIVE_LABEL_SHIELD_CACHE_KEY = 'hollowgate-reflective-label-shield-v1';
const reflectiveLabelMasks = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();

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
  return Math.min(
    PHOTO_UNLIT_LABEL_OUTLINE_MAX_WIDTH,
    Math.max(PHOTO_UNLIT_LABEL_OUTLINE_MIN_WIDTH, proportionalWidth),
  );
}

function isReflectiveStandardDescriptor(descriptor: Dice3DAppearanceDescriptor): boolean {
  if (descriptor.custom) return false;
  const skinId = descriptor.appearance.skinId;
  return skinId === 'metal' || skinId === 'obsidian';
}

function reflectiveMaskContext(source: CanvasRenderingContext2D): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined' || typeof HTMLCanvasElement === 'undefined') return null;
  const sourceCanvas = source.canvas;
  if (!(sourceCanvas instanceof HTMLCanvasElement)) return null;
  let maskCanvas = reflectiveLabelMasks.get(sourceCanvas);
  if (!maskCanvas || maskCanvas.width !== sourceCanvas.width || maskCanvas.height !== sourceCanvas.height) {
    maskCanvas = document.createElement('canvas');
    maskCanvas.width = sourceCanvas.width;
    maskCanvas.height = sourceCanvas.height;
    reflectiveLabelMasks.set(sourceCanvas, maskCanvas);
  }
  return maskCanvas.getContext('2d', { alpha: true });
}

function copyTextMaskState(source: CanvasRenderingContext2D, target: CanvasRenderingContext2D): void {
  target.setTransform(source.getTransform());
  target.globalAlpha = source.globalAlpha;
  target.globalCompositeOperation = 'source-over';
  target.font = source.font;
  target.textAlign = source.textAlign;
  target.textBaseline = source.textBaseline;
  target.direction = source.direction;
  target.lineWidth = source.lineWidth;
  target.lineCap = source.lineCap;
  target.lineJoin = source.lineJoin;
  target.miterLimit = source.miterLimit;
  target.shadowBlur = 0;
  target.shadowColor = 'transparent';
}

function runWithDice3DLabelOutlineBoost<T>(descriptor: Dice3DAppearanceDescriptor, work: () => T): T {
  if (typeof CanvasRenderingContext2D === 'undefined') return work();
  const prototype = CanvasRenderingContext2D.prototype;
  const originalFillText = prototype.fillText;
  const originalStrokeText = prototype.strokeText;
  const originalClearRect = prototype.clearRect;
  const protectReflectiveLabel = isReflectiveStandardDescriptor(descriptor);
  const obsidianDualOutline = !descriptor.custom && descriptor.appearance.skinId === 'obsidian';
  const obsidianLabelColor = getReadable3DLabelColor(descriptor.appearance.symbolColor, descriptor.appearance.bodyColor, descriptor.appearance.skinId);
  const obsidianOutlineColor = readableOutlineColor(obsidianLabelColor);
  const obsidianOuterOutlineColor = readableOutlineColor(obsidianOutlineColor);

  prototype.clearRect = function (
    this: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    originalClearRect.call(this, x, y, width, height);
    if (!protectReflectiveLabel) return;
    const maskContext = reflectiveMaskContext(this);
    if (!maskContext) return;
    maskContext.save();
    try {
      copyTextMaskState(this, maskContext);
      originalClearRect.call(maskContext, x, y, width, height);
    } finally {
      maskContext.restore();
    }
  };

  prototype.fillText = function (
    this: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth?: number,
  ): void {
    if (typeof maxWidth === 'number') originalFillText.call(this, text, x, y, maxWidth);
    else originalFillText.call(this, text, x, y);
    if (!protectReflectiveLabel) return;
    const maskContext = reflectiveMaskContext(this);
    if (!maskContext) return;
    maskContext.save();
    try {
      copyTextMaskState(this, maskContext);
      maskContext.fillStyle = '#ffffff';
      if (typeof maxWidth === 'number') originalFillText.call(maskContext, text, x, y, maxWidth);
      else originalFillText.call(maskContext, text, x, y);
    } finally {
      maskContext.restore();
    }
  };

  prototype.strokeText = function (
    this: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth?: number,
  ): void {
    const previousLineWidth = this.lineWidth;
    const previousStrokeStyle = this.strokeStyle;
    this.lineWidth = Math.max(previousLineWidth, dice3DLabelOutlineWidth(this, descriptor));
    try {
      if (obsidianDualOutline) {
        this.lineWidth = this.lineWidth + OBSIDIAN_OUTER_OUTLINE_EXTRA_WIDTH;
        this.strokeStyle = obsidianOuterOutlineColor;
        if (typeof maxWidth === 'number') originalStrokeText.call(this, text, x, y, maxWidth);
        else originalStrokeText.call(this, text, x, y);
        this.lineWidth = Math.max(previousLineWidth, dice3DLabelOutlineWidth(this, descriptor));
        this.strokeStyle = previousStrokeStyle;
      }
      if (typeof maxWidth === 'number') originalStrokeText.call(this, text, x, y, maxWidth);
      else originalStrokeText.call(this, text, x, y);
      if (protectReflectiveLabel) {
        const maskContext = reflectiveMaskContext(this);
        if (maskContext) {
          maskContext.save();
          try {
            copyTextMaskState(this, maskContext);
            if (obsidianDualOutline) {
              maskContext.lineWidth = this.lineWidth + OBSIDIAN_OUTER_OUTLINE_EXTRA_WIDTH;
              maskContext.strokeStyle = obsidianOuterOutlineColor;
              if (typeof maxWidth === 'number') originalStrokeText.call(maskContext, text, x, y, maxWidth);
              else originalStrokeText.call(maskContext, text, x, y);
              maskContext.lineWidth = this.lineWidth;
            }
            maskContext.strokeStyle = '#ffffff';
            if (typeof maxWidth === 'number') originalStrokeText.call(maskContext, text, x, y, maxWidth);
            else originalStrokeText.call(maskContext, text, x, y);
          } finally {
            maskContext.restore();
          }
        }
      }
    } finally {
      this.lineWidth = previousLineWidth;
      this.strokeStyle = previousStrokeStyle;
    }
  };
  try {
    return work();
  } finally {
    prototype.fillText = originalFillText;
    prototype.strokeText = originalStrokeText;
    prototype.clearRect = originalClearRect;
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
  factory.dice_color = appearance.bodyColor;
  factory.dice_color_rand = appearance.bodyColor;
  factory.edge_color = appearance.bodyColor;
  factory.edge_color_rand = appearance.bodyColor;
  factory.label_color = labelColor;
  factory.label_color_rand = labelColor;
  factory.label_outline = outlineColor;
  factory.label_outline_rand = outlineColor;

  let texture: unknown = NEUTRAL_TEXTURE;
  if (!descriptor.custom) {
    try { texture = getDice3DTextureDescriptor(appearance); }
    catch (error) { console.error('Texture skin 3D non disponibile, uso il materiale neutro:', error); }
  }
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

function protectReflectiveDiceLabelFromLighting(material: MaterialLike, descriptor: Dice3DAppearanceDescriptor): void {
  const skinId = descriptor.appearance.skinId;
  if (descriptor.custom || (skinId !== 'metal' && skinId !== 'obsidian')) return;
  if (!material.map || typeof material.map.clone !== 'function') return;
  if (typeof HTMLCanvasElement === 'undefined' || !(material.map.image instanceof HTMLCanvasElement)) return;
  const maskCanvas = reflectiveLabelMasks.get(material.map.image);
  if (!maskCanvas) return;
  if (material.userData?.hollowgateReflectiveLabelShield === true) return;

  const maskTexture = material.map.clone();
  maskTexture.image = maskCanvas;
  maskTexture.anisotropy = material.map.anisotropy;
  maskTexture.generateMipmaps = material.map.generateMipmaps;
  maskTexture.needsUpdate = true;

  const previousOnBeforeCompile = material.onBeforeCompile;
  const previousProgramCacheKey = material.customProgramCacheKey?.bind(material);
  material.onBeforeCompile = (shader) => {
    previousOnBeforeCompile?.(shader);
    shader.uniforms.reflectiveLabelMask = { value: maskTexture };
    const outputChunk = REFLECTIVE_OUTPUT_FRAGMENT_CHUNKS.find((chunk) => shader.fragmentShader.includes(chunk));
    if (!outputChunk) return;
    shader.fragmentShader = `uniform sampler2D reflectiveLabelMask;\n${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace(
      outputChunk,
      `${outputChunk}\n#ifdef USE_MAP\n  float reflectiveLabelProtection = smoothstep(0.02, 0.72, texture2D(reflectiveLabelMask, vMapUv).a);\n  vec3 reflectiveLabelTexel = texture2D(map, vMapUv).rgb;\n  gl_FragColor.rgb = mix(gl_FragColor.rgb, reflectiveLabelTexel, reflectiveLabelProtection);\n#endif`,
    );
  };
  material.customProgramCacheKey = () => `${previousProgramCacheKey?.() ?? ''}|${REFLECTIVE_LABEL_SHIELD_CACHE_KEY}`;
  material.userData = { ...material.userData, hollowgateReflectiveLabelShield: true };
  material.addEventListener?.('dispose', () => maskTexture.dispose?.());
  material.needsUpdate = true;
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

function preserveMetalFaceTexture(material: MaterialLike) {
  material.color?.set?.(0xffffff);
  if (!material.map) return;
  material.map.anisotropy = Math.max(material.map.anisotropy ?? 1, TEXTURED_FACE_ANISOTROPY);
  material.map.generateMipmaps = true;
  material.map.needsUpdate = true;
  material.roughness = 0.46;
  material.metalness = 0.58;
  material.shininess = 64;
}

function preserveObsidianFaceTexture(material: MaterialLike) {
  material.color?.set?.(0xffffff);
  if (!material.map) return;
  material.map.anisotropy = Math.max(material.map.anisotropy ?? 1, TEXTURED_FACE_ANISOTROPY);
  material.map.generateMipmaps = true;
  material.map.needsUpdate = true;
  material.roughness = 0.18;
  material.metalness = 0.08;
  material.shininess = 138;
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
      if (skinId === 'metal' && !descriptor.custom) preserveMetalFaceTexture(material);
      if (skinId === 'obsidian' && !descriptor.custom) preserveObsidianFaceTexture(material);
      protectReflectiveDiceLabelFromLighting(material, descriptor);
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
      const mesh = shouldBoostDice3DLabelOutline(descriptor)
        ? runWithDice3DLabelOutlineBoost(descriptor, () => originalCreate(type))
        : originalCreate(type);
      applyStaticSkinToMesh(mesh, descriptor);
      applyDice3DSurfaceProfile(mesh, descriptor);
      effects.registerMesh(mesh, descriptor);
      visualBoostCleanups.push(installDice3DVisualBoost(mesh, descriptor));
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
        const swapped = shouldBoostDice3DLabelOutline(descriptor)
          ? runWithDice3DLabelOutlineBoost(descriptor, () => previousSwapD4.call(box, dicemesh, result))
          : previousSwapD4.call(box, dicemesh, result);
        applyStaticSkinToMesh(dicemesh, descriptor);
        applyDice3DSurfaceProfile(dicemesh, descriptor);
        return swapped;
      } finally { Object.assign(factory, originalState); }
    };
  }

  return {
    effects,
    restore: () => {
      factory.create = originalCreate;
      if (originalSetMaterialInfo) factory.setMaterialInfo = originalSetMaterialInfo;
      if (previousSwapD4) box.swapDiceFace_D4 = previousSwapD4;
      visualBoostCleanups.splice(0).forEach((cleanup) => cleanup());
      effects.stop();
    },
  };
}