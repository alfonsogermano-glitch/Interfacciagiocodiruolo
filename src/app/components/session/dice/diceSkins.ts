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

export function getDiceSkinBackgroundImage(skinId: DiceSkinId, bodyColor: string): string | undefined {
  const light = mix(bodyColor, '#ffffff', 0.42);
  const bright = mix(bodyColor, '#ffffff', 0.7);
  const dark = mix(bodyColor, '#000000', 0.5);
  const deep = mix(bodyColor, '#000000', 0.72);

  switch (skinId) {
    case 'none':
      return undefined;
    case 'fire':
      return `radial-gradient(circle at 22% 72%, ${bright} 0 4%, transparent 5%), radial-gradient(circle at 72% 28%, ${light} 0 3%, transparent 4%), repeating-linear-gradient(132deg, transparent 0 8px, ${deep} 9px 11px, transparent 12px 18px)`;
    case 'ice':
      return `linear-gradient(135deg, ${light}55 0 18%, transparent 19% 48%, ${bright}55 49% 54%, transparent 55%), repeating-linear-gradient(45deg, transparent 0 9px, ${dark}33 10px 11px, transparent 12px 18px)`;
    case 'lightning':
      return `linear-gradient(118deg, transparent 0 26%, ${bright} 27% 30%, transparent 31% 46%, ${light} 47% 49%, transparent 50%), radial-gradient(circle at 66% 65%, ${bright}66 0 5%, transparent 6%)`;
    case 'poison':
      return `radial-gradient(circle at 26% 32%, ${light}99 0 8%, transparent 9%), radial-gradient(circle at 68% 70%, ${dark}88 0 11%, transparent 12%), radial-gradient(circle at 82% 24%, ${bright}77 0 5%, transparent 6%)`;
    case 'stone':
      return `radial-gradient(circle at 18% 24%, ${dark}77 0 3%, transparent 4%), radial-gradient(circle at 72% 63%, ${light}66 0 4%, transparent 5%), repeating-linear-gradient(25deg, transparent 0 10px, ${deep}44 11px 12px, transparent 13px 22px)`;
    case 'metal':
      return `linear-gradient(105deg, ${deep}55 0 8%, transparent 19% 37%, ${bright}88 49%, transparent 61% 82%, ${dark}55 93%), repeating-linear-gradient(0deg, transparent 0 5px, ${light}33 6px, transparent 7px 12px)`;
    case 'obsidian':
      return `linear-gradient(142deg, ${deep}aa 0 38%, transparent 39% 56%, ${light}66 57% 60%, transparent 61%), radial-gradient(circle at 70% 25%, ${bright}44 0 5%, transparent 6%)`;
    case 'arcane':
      return `radial-gradient(circle at 50% 50%, transparent 0 22%, ${bright}88 23% 25%, transparent 26% 38%, ${light}66 39% 41%, transparent 42%), linear-gradient(45deg, transparent 0 46%, ${bright}77 47% 52%, transparent 53%)`;
  }
}
