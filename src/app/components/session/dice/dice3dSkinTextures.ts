import { FIRE_TEXTURE_DATA_URL } from './fireTextureData.ts';
import { ICE_TEXTURE_DATA_URL } from './iceTextureData.ts';
import { normalizeDiceTextureScale } from './diceTextureScale.ts';
import type { DiceAppearance, DiceSkinId } from './diceTypes.ts';

export interface Dice3DTextureDescriptor {
  name: string;
  texture: HTMLCanvasElement | null;
  bump: HTMLCanvasElement | null;
  composite: 'source-over';
  material: 'none' | 'metal';
}

const TEXTURE_SIZE = 512;
const cache = new Map<string, Dice3DTextureDescriptor>();

function createTextureImage(dataUrl: string, cachePrefix: string): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  const image = new Image();
  image.decoding = 'async';
  image.src = dataUrl;
  image.addEventListener('load', () => {
    for (const key of cache.keys()) {
      if (key.startsWith(`${cachePrefix}:`)) cache.delete(key);
    }
  }, { once: true });
  return image;
}

const fireTextureImage = createTextureImage(FIRE_TEXTURE_DATA_URL, 'fire');
const iceTextureImage = createTextureImage(ICE_TEXTURE_DATA_URL, 'ice');

function resetContext(context: CanvasRenderingContext2D, size: number) {
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
  context.globalCompositeOperation = 'source-over';
  context.shadowBlur = 0;
  context.shadowColor = 'transparent';
  context.filter = 'none';
  context.clearRect(0, 0, size, size);
}

function drawImageCover(context: CanvasRenderingContext2D, image: HTMLImageElement, size: number) {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (sourceWidth <= 0 || sourceHeight <= 0) return;
  const sourceRatio = sourceWidth / sourceHeight;
  let sourceX = 0;
  let sourceY = 0;
  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  if (sourceRatio > 1) {
    cropWidth = sourceHeight;
    sourceX = (sourceWidth - cropWidth) / 2;
  } else if (sourceRatio < 1) {
    cropHeight = sourceWidth;
    sourceY = (sourceHeight - cropHeight) / 2;
  }
  context.drawImage(image, sourceX, sourceY, cropWidth, cropHeight, 0, 0, size, size);
}

function drawFirePhotoTexture(context: CanvasRenderingContext2D, bump: CanvasRenderingContext2D, size: number, bodyColor: string): boolean {
  const fireImage = fireTextureImage;
  if (!fireImage?.complete || fireImage.naturalWidth <= 0) return false;
  context.save();
  context.filter = 'brightness(1.24) saturate(1.12)';
  drawImageCover(context, fireImage, size);
  context.filter = 'none';
  context.globalCompositeOperation = 'source-over';
  context.globalAlpha = 0.34;
  context.fillStyle = bodyColor;
  context.fillRect(0, 0, size, size);
  context.globalCompositeOperation = 'screen';
  context.globalAlpha = 0.1;
  context.fillStyle = '#f3c5aa';
  context.fillRect(0, 0, size, size);
  context.restore();
  bump.save();
  bump.filter = 'grayscale(1) contrast(1.55)';
  drawImageCover(bump, fireImage, size);
  bump.restore();
  return true;
}

function drawIcePhotoTexture(context: CanvasRenderingContext2D, bump: CanvasRenderingContext2D, size: number, bodyColor: string): boolean {
  const image = iceTextureImage;
  if (!image?.complete || image.naturalWidth <= 0) return false;
  context.save();
  context.filter = 'brightness(1.05) saturate(1.08) contrast(1.08)';
  drawImageCover(context, image, size);
  context.filter = 'none';
  context.globalCompositeOperation = 'source-over';
  context.globalAlpha = 0.10;
  context.fillStyle = bodyColor;
  context.fillRect(0, 0, size, size);
  context.globalCompositeOperation = 'screen';
  context.globalAlpha = 0.08;
  context.fillStyle = '#d9f8ff';
  context.fillRect(0, 0, size, size);
  context.restore();
  bump.save();
  bump.filter = 'grayscale(1) contrast(1.8) brightness(.92)';
  drawImageCover(bump, image, size);
  bump.restore();
  return true;
}

function drawCracks(context: CanvasRenderingContext2D, size: number, color: string, lineWidth: number, alpha = 1) {
  context.save();
  context.globalAlpha = alpha;
  context.strokeStyle = color;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = lineWidth;
  for (let i = 0; i < 10; i += 1) {
    const x = (((i * 47) % 91) / 100) * size;
    const y = (((i * 31 + 11) % 89) / 100) * size;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + size * 0.14, y + size * 0.07);
    context.lineTo(x + size * 0.07, y + size * 0.17);
    context.lineTo(x + size * 0.18, y + size * 0.24);
    context.stroke();
  }
  context.restore();
}

function applyTextureZoom(context: CanvasRenderingContext2D, bump: CanvasRenderingContext2D, size: number, textureScale: number | undefined) {
  const zoom = normalizeDiceTextureScale(textureScale) / 100;
  const offset = (size - size * zoom) / 2;
  context.setTransform(zoom, 0, 0, zoom, offset, offset);
  bump.setTransform(zoom, 0, 0, zoom, offset, offset);
}

function drawPattern(textureCanvas: HTMLCanvasElement, bumpCanvas: HTMLCanvasElement, skinId: DiceSkinId, bodyColor: string, textureScale?: number) {
  const context = textureCanvas.getContext('2d');
  const bump = bumpCanvas.getContext('2d');
  if (!context || !bump) return;
  const size = textureCanvas.width;
  resetContext(context, size);
  resetContext(bump, size);
  applyTextureZoom(context, bump, size, textureScale);

  switch (skinId) {
    case 'none': break;
    case 'fire': {
      if (drawFirePhotoTexture(context, bump, size, bodyColor)) break;
      context.save();
      context.shadowColor = 'rgba(255,115,28,.95)'; context.shadowBlur = size / 38;
      drawCracks(context, size, 'rgba(255,214,112,.96)', size / 58);
      context.restore();
      drawCracks(context, size, 'rgba(70,12,0,.9)', size / 105);
      drawCracks(bump, size, '#303030', size / 72);
      for (let i = 0; i < 18; i += 1) {
        const x = (((i * 37) % 97) / 100) * size;
        const y = (((i * 61) % 91) / 100) * size;
        const radius = size * (0.012 + (i % 4) * 0.004);
        context.fillStyle = i % 3 === 0 ? 'rgba(255,238,170,.8)' : 'rgba(65,8,0,.48)';
        context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill();
      }
      break;
    }
    case 'ice': {
      if (drawIcePhotoTexture(context, bump, size, bodyColor)) break;
      context.save();
      context.strokeStyle = 'rgba(226,252,255,.86)'; context.lineWidth = size / 92;
      context.shadowColor = 'rgba(113,225,255,.7)'; context.shadowBlur = size / 50;
      for (let i = -size; i < size * 2; i += size / 6) {
        context.beginPath(); context.moveTo(i, 0); context.lineTo(i + size, size); context.stroke();
      }
      context.restore();
      drawCracks(context, size, 'rgba(38,112,148,.48)', size / 145);
      drawCracks(bump, size, '#777777', size / 115);
      break;
    }
    case 'lightning': {
      context.save(); context.shadowColor = 'rgba(110,229,255,1)'; context.shadowBlur = size / 34;
      for (let i = 0; i < 5; i += 1) {
        const x = size * (0.08 + i * 0.2);
        context.strokeStyle = 'rgba(245,253,255,.98)'; context.lineWidth = size / 52;
        context.beginPath(); context.moveTo(x, -size * 0.04); context.lineTo(x + size * 0.09, size * 0.25); context.lineTo(x - size * 0.025, size * 0.5); context.lineTo(x + size * 0.12, size * 1.04); context.stroke();
        bump.strokeStyle = '#5b5b5b'; bump.lineWidth = size / 80;
        bump.beginPath(); bump.moveTo(x, 0); bump.lineTo(x + size * 0.09, size * 0.25); bump.lineTo(x - size * 0.025, size * 0.5); bump.lineTo(x + size * 0.12, size); bump.stroke();
      }
      context.restore(); break;
    }
    case 'poison': {
      for (let i = 0; i < 22; i += 1) {
        const x = (((i * 43) % 97) / 100) * size;
        const y = (((i * 29 + 17) % 93) / 100) * size;
        const radius = size * (0.018 + (i % 5) * 0.007);
        context.fillStyle = i % 3 === 0 ? 'rgba(209,255,145,.62)' : 'rgba(17,61,12,.5)';
        context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill();
        bump.strokeStyle = '#686868'; bump.lineWidth = size / 150;
        bump.beginPath(); bump.arc(x, y, radius, 0, Math.PI * 2); bump.stroke();
      }
      break;
    }
    case 'stone': {
      for (let i = 0; i < 150; i += 1) {
        const x = (((i * 53) % 101) / 100) * size;
        const y = (((i * 71 + 9) % 103) / 100) * size;
        const radius = size * (0.003 + (i % 4) * 0.0018);
        context.fillStyle = i % 2 ? 'rgba(255,255,255,.2)' : 'rgba(0,0,0,.34)';
        context.fillRect(x, y, radius * 2, radius * 2);
        bump.fillStyle = i % 2 ? '#c8c8c8' : '#595959'; bump.fillRect(x, y, radius * 2, radius * 2);
      }
      drawCracks(context, size, 'rgba(0,0,0,.28)', size / 165);
      drawCracks(bump, size, '#676767', size / 130); break;
    }
    case 'metal': {
      const gradient = context.createLinearGradient(0, 0, size, 0);
      gradient.addColorStop(0, 'rgba(255,255,255,.06)'); gradient.addColorStop(0.18, 'rgba(255,255,255,.18)');
      gradient.addColorStop(0.42, 'rgba(255,255,255,.32)'); gradient.addColorStop(0.52, 'rgba(255,255,255,.68)');
      gradient.addColorStop(0.62, 'rgba(255,255,255,.26)'); gradient.addColorStop(0.82, 'rgba(255,255,255,.12)'); gradient.addColorStop(1, 'rgba(0,0,0,.08)');
      context.fillStyle = gradient; context.fillRect(0, 0, size, size);
      context.strokeStyle = 'rgba(255,255,255,.2)'; context.lineWidth = size / 235;
      for (let y = 0; y < size; y += size / 20) {
        context.beginPath(); context.moveTo(0, y); context.lineTo(size, y + size / 34); context.stroke();
        bump.strokeStyle = y % (size / 10) < 1 ? '#c8c8c8' : '#9a9a9a'; bump.lineWidth = size / 235;
        bump.beginPath(); bump.moveTo(0, y); bump.lineTo(size, y + size / 34); bump.stroke();
      }
      break;
    }
    case 'obsidian': {
      context.fillStyle = 'rgba(0,0,0,.48)'; context.fillRect(0, 0, size, size);
      context.save(); context.shadowColor = 'rgba(146,91,255,.8)'; context.shadowBlur = size / 48;
      drawCracks(context, size, 'rgba(201,176,255,.75)', size / 78); context.restore();
      drawCracks(context, size, 'rgba(36,10,54,.95)', size / 145); drawCracks(bump, size, '#4c4c4c', size / 92); break;
    }
    case 'arcane': {
      context.save(); context.translate(size / 2, size / 2);
      context.strokeStyle = 'rgba(236,207,255,.78)'; context.shadowColor = 'rgba(181,84,255,.9)'; context.shadowBlur = size / 44; context.lineWidth = size / 105;
      for (const radius of [0.18, 0.29, 0.4]) { context.beginPath(); context.arc(0, 0, size * radius, 0, Math.PI * 2); context.stroke(); }
      for (let i = 0; i < 6; i += 1) {
        const angle = (Math.PI * 2 * i) / 6;
        context.beginPath(); context.moveTo(Math.cos(angle) * size * 0.12, Math.sin(angle) * size * 0.12); context.lineTo(Math.cos(angle) * size * 0.43, Math.sin(angle) * size * 0.43); context.stroke();
      }
      context.restore(); bump.strokeStyle = '#797979'; bump.lineWidth = size / 125;
      bump.beginPath(); bump.arc(size / 2, size / 2, size * 0.29, 0, Math.PI * 2); bump.stroke(); break;
    }
  }

  context.globalAlpha = 1;
  bump.globalAlpha = 1;
}

export function getDice3DTextureDescriptor(appearance: DiceAppearance): Dice3DTextureDescriptor {
  if (appearance.skinId === 'none') return { name: 'none', texture: null, bump: null, composite: 'source-over', material: 'none' };
  const textureScale = normalizeDiceTextureScale(appearance.textureScale);
  const key = `${appearance.skinId}:${appearance.bodyColor}:${textureScale}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas'); canvas.width = TEXTURE_SIZE; canvas.height = TEXTURE_SIZE;
  const bumpCanvas = document.createElement('canvas'); bumpCanvas.width = TEXTURE_SIZE; bumpCanvas.height = TEXTURE_SIZE;
  drawPattern(canvas, bumpCanvas, appearance.skinId, appearance.bodyColor, textureScale);
  const descriptor: Dice3DTextureDescriptor = { name: `hollowgate-${appearance.skinId}-${appearance.bodyColor}-${textureScale}`, texture: canvas, bump: bumpCanvas, composite: 'source-over', material: 'none' };
  cache.set(key, descriptor);
  return descriptor;
}
