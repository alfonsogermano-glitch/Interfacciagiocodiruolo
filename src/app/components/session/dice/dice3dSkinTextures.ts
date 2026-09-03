import type { DiceAppearance, DiceSkinId } from './diceTypes.ts';

export interface Dice3DTextureDescriptor {
  name: string;
  texture: HTMLCanvasElement | null;
  bump: HTMLCanvasElement | null;
  composite: 'source-over';
  material: 'none' | 'metal';
}

const cache = new Map<string, Dice3DTextureDescriptor>();

function drawCracks(context: CanvasRenderingContext2D, size: number, color: string) {
  context.strokeStyle = color;
  context.lineWidth = Math.max(2, size / 90);
  for (let i = 0; i < 8; i += 1) {
    const x = ((i * 47) % 91) / 100 * size;
    const y = ((i * 31 + 11) % 89) / 100 * size;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + size * 0.13, y + size * 0.08);
    context.lineTo(x + size * 0.06, y + size * 0.18);
    context.stroke();
  }
}

function drawPattern(canvas: HTMLCanvasElement, skinId: DiceSkinId) {
  const context = canvas.getContext('2d');
  if (!context) return;
  const size = canvas.width;
  context.clearRect(0, 0, size, size);

  switch (skinId) {
    case 'none':
      break;
    case 'fire': {
      context.globalAlpha = 0.75;
      drawCracks(context, size, '#ffffff');
      context.globalAlpha = 0.22;
      context.fillStyle = '#000000';
      for (let i = 0; i < 14; i += 1) {
        context.beginPath();
        context.arc(((i * 37) % 97) / 100 * size, ((i * 61) % 91) / 100 * size, size * (0.02 + (i % 3) * 0.008), 0, Math.PI * 2);
        context.fill();
      }
      break;
    }
    case 'ice': {
      context.globalAlpha = 0.38;
      context.strokeStyle = '#ffffff';
      context.lineWidth = Math.max(1, size / 130);
      for (let i = -size; i < size * 2; i += size / 5) {
        context.beginPath();
        context.moveTo(i, 0);
        context.lineTo(i + size, size);
        context.stroke();
      }
      context.globalAlpha = 0.2;
      drawCracks(context, size, '#000000');
      break;
    }
    case 'lightning': {
      context.globalAlpha = 0.8;
      context.strokeStyle = '#ffffff';
      context.lineWidth = Math.max(2, size / 80);
      for (let i = 0; i < 4; i += 1) {
        const x = size * (0.12 + i * 0.22);
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x + size * 0.08, size * 0.28);
        context.lineTo(x - size * 0.02, size * 0.52);
        context.lineTo(x + size * 0.11, size);
        context.stroke();
      }
      break;
    }
    case 'poison': {
      for (let i = 0; i < 16; i += 1) {
        context.globalAlpha = 0.16 + (i % 4) * 0.04;
        context.fillStyle = i % 2 ? '#ffffff' : '#000000';
        context.beginPath();
        context.arc(((i * 43) % 97) / 100 * size, ((i * 29 + 17) % 93) / 100 * size, size * (0.025 + (i % 5) * 0.006), 0, Math.PI * 2);
        context.fill();
      }
      break;
    }
    case 'stone': {
      for (let i = 0; i < 80; i += 1) {
        context.globalAlpha = 0.08 + (i % 5) * 0.02;
        context.fillStyle = i % 2 ? '#ffffff' : '#000000';
        const radius = size * (0.004 + (i % 4) * 0.002);
        context.fillRect(((i * 53) % 101) / 100 * size, ((i * 71 + 9) % 103) / 100 * size, radius, radius);
      }
      break;
    }
    case 'metal': {
      const gradient = context.createLinearGradient(0, 0, size, 0);
      gradient.addColorStop(0, 'rgba(0,0,0,.18)');
      gradient.addColorStop(0.45, 'rgba(255,255,255,.08)');
      gradient.addColorStop(0.55, 'rgba(255,255,255,.42)');
      gradient.addColorStop(1, 'rgba(0,0,0,.2)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, size, size);
      context.globalAlpha = 0.18;
      context.strokeStyle = '#ffffff';
      for (let y = 0; y < size; y += size / 16) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(size, y + size / 24);
        context.stroke();
      }
      break;
    }
    case 'obsidian': {
      context.globalAlpha = 0.42;
      context.fillStyle = '#000000';
      context.fillRect(0, 0, size, size);
      context.globalAlpha = 0.45;
      drawCracks(context, size, '#ffffff');
      break;
    }
    case 'arcane': {
      context.globalAlpha = 0.45;
      context.strokeStyle = '#ffffff';
      context.lineWidth = Math.max(1, size / 100);
      context.beginPath();
      context.arc(size / 2, size / 2, size * 0.27, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.moveTo(size * 0.2, size * 0.5);
      context.lineTo(size * 0.8, size * 0.5);
      context.moveTo(size * 0.5, size * 0.2);
      context.lineTo(size * 0.5, size * 0.8);
      context.stroke();
      break;
    }
  }

  context.globalAlpha = 1;
}

export function getDice3DTextureDescriptor(appearance: DiceAppearance): Dice3DTextureDescriptor {
  if (appearance.skinId === 'none') {
    return { name: 'none', texture: null, bump: null, composite: 'source-over', material: 'none' };
  }
  const key = `${appearance.skinId}:${appearance.bodyColor}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  drawPattern(canvas, appearance.skinId);

  const descriptor: Dice3DTextureDescriptor = {
    name: `hollowgate-${appearance.skinId}-${appearance.bodyColor}`,
    texture: canvas,
    bump: null,
    composite: 'source-over',
    material: appearance.skinId === 'metal' ? 'metal' : 'none',
  };
  cache.set(key, descriptor);
  return descriptor;
}
