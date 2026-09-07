import { ARCANE_TEXTURE_DATA_URL } from './arcaneTextureData.ts';
import { FIRE_TEXTURE_DATA_URL } from './fireTextureData.ts';
import { ICE_TEXTURE_DATA_URL } from './iceTextureData.ts';
import { LIGHTNING_TEXTURE_DATA_URL } from './lightningTextureData.ts';
import { METAL_TEXTURE_DATA_URL } from './metalTextureData.ts';
import { OBSIDIAN_TEXTURE_DATA_URL } from './obsidianTextureData.ts';
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

function rgba(base: string, alpha: number): string {
  const [red, green, blue] = parseHex(base);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function getDiceSkinBackgroundImage(skinId: DiceSkinId, bodyColor: string): string | undefined {
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
      return `url("${OBSIDIAN_TEXTURE_DATA_URL}")`;
    case 'arcane':
      return `url("${ARCANE_TEXTURE_DATA_URL}")`;
  }
}
