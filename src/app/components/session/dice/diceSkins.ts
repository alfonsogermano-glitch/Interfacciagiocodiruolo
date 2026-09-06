import { FIRE_TEXTURE_DATA_URL } from './fireTextureData.ts';
import { ICE_TEXTURE_DATA_URL } from './iceTextureData.ts';
import { LIGHTNING_TEXTURE_DATA_URL } from './lightningTextureData.ts';
import { METAL_TEXTURE_DATA_URL } from './metalTextureData.ts';
import { POISON_TEXTURE_DATA_URL } from './poisonTextureData.ts';
import { STONE_TEXTURE_DATA_URL } from './stoneTextureData.ts';
import type { DiceSkinId } from './diceTypes.ts';

export interface DiceSkinDefinition {
  id: DiceSkinId;
  label: string;
  description: string;
  material: 'plastic' | 'metal' | 'stone' | 'glasslike';
  effectKind: DiceSkinId | null;
}

export const DICE_SKINS: readonly DiceSkinDefinition[] = [
  { id: 'none', label: 'Nessuna', description: 'Superficie pulita', material: 'plastic', effectKind: null },
  { id: 'fire', label: 'Fuoco', description: 'Venature incandescenti', material: 'stone', effectKind: 'fire' },
  { id: 'ice', label: 'Ghiaccio', description: 'Cristalli e brina', material: 'glasslike', effectKind: 'ice' },
  { id: 'lightning', label: 'Fulmine', description: 'Scariche elettriche', material: 'plastic', effectKind: 'lightning' },
  { id: 'poison', label: 'Veleno', description: 'Trama organica', material: 'plastic', effectKind: 'poison' },
  { id: 'stone', label: 'Pietra', description: 'Grana minerale', material: 'stone', effectKind: 'stone' },
  { id: 'metal', label: 'Metallo', description: 'Superficie metallica', material: 'metal', effectKind: 'metal' },
  { id: 'obsidian', label: 'Ossidiana', description: 'Vetro vulcanico', material: 'glasslike', effectKind: 'obsidian' },
  { id: 'arcane', label: 'Arcana', description: 'Rune energetiche', material: 'plastic', effectKind: 'arcane' },
] as const;

export const DICE_SKIN_IDS = DICE_SKINS.map((skin) => skin.id) as readonly DiceSkinId[];

export function isDiceSkinId(value: unknown): value is DiceSkinId {
  return typeof value === 'string' && (DICE_SKIN_IDS as readonly string[]).includes(value);
}

export function getDiceSkinDefinition(skinId: DiceSkinId): DiceSkinDefinition {
  return DICE_SKINS.find((skin) => skin.id === skinId) ?? DICE_SKINS[0];
}

function parseHex(value: string): [number, number, number] {
  const normalized = /^#[0-9a-f]{6}$/i.test(value) ? value.slice(1) : '20242f';
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

function toHex(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
}

function mix(base: string, target: string, amount: number): string {
  const a = parseHex(base);
  const b = parseHex(target);
  return `#${toHex(a[0] + (b[0] - a[0]) * amount)}${toHex(a[1] + (b[1] - a[1]) * amount)}${toHex(a[2] + (b[2] - a[2]) * amount)}`;
}

function rgba(base: string, alpha: number): string {
  const [red, green, blue] = parseHex(base);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function getDiceSkinBackgroundImage(skinId: DiceSkinId, bodyColor: string): string | undefined {
  const light = mix(bodyColor, '#ffffff', 0.42);
  const bright = mix(bodyColor, '#ffffff', 0.7);
  const dark = mix(bodyColor, '#000000', 0.5);
  const deep = mix(bodyColor, '#000000', 0.72);

  switch (skinId) {
    case 'none':
      return undefined;
    case 'fire':
      return `linear-gradient(${rgba(bodyColor, 0.34)}, ${rgba(bodyColor, 0.34)}), url("${FIRE_TEXTURE_DATA_URL}")`;
    case 'ice':
      return `linear-gradient(${rgba(bodyColor, 0.10)}, ${rgba(bodyColor, 0.10)}), url("${ICE_TEXTURE_DATA_URL}")`;
    case 'lightning':
      return `url("${LIGHTNING_TEXTURE_DATA_URL}")`;
    case 'poison':
      return `url("${POISON_TEXTURE_DATA_URL}")`;
    case 'stone':
      return `url("${STONE_TEXTURE_DATA_URL}")`;
    case 'metal':
      return `url("${METAL_TEXTURE_DATA_URL}")`;
    case 'obsidian':
      return `linear-gradient(142deg, ${deep}aa 0 38%, transparent 39% 56%, ${light}66 57% 60%, transparent 61%), radial-gradient(circle at 70% 25%, ${bright}44 0 5%, transparent 6%)`;
    case 'arcane':
      return `radial-gradient(circle at 50% 50%, transparent 0 22%, ${bright}88 23% 25%, transparent 26% 38%, ${light}66 39% 41%, transparent 42%), linear-gradient(45deg, transparent 0 46%, ${bright}77 47% 52%, transparent 53%)`;
  }
}
