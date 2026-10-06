export type ContentMode = 'local' | 'cloud';
let ownerId: string | null = null;

export function setPersistenceIdentity(id: string | null): void { ownerId = id; }
export function persistenceOwner(): string { return ownerId ?? 'anonymous'; }
export function selectedContentMode(): ContentMode {
  if (typeof localStorage === 'undefined') return 'cloud';
  try {
    const raw = localStorage.getItem(`hsc_dashboard_settings:${persistenceOwner()}`);
    return raw && JSON.parse(raw).saveMode === 'local' ? 'local' : 'cloud';
  } catch { return 'cloud'; }
}
export function persistenceKey(key: string): string {
  return `${key}:${persistenceOwner()}:${selectedContentMode()}`;
}

export const CONTENT_TABLES = new Set([
  'campaigns', 'entity_notes', 'folders', 'characters', 'npcs', 'monsters',
  'environments', 'clues', 'situations', 'adventures', 'equipment_catalog',
  'character_equipment', 'dice_formulas', 'dice_formula_folders', 'dice_custom_dice',
  'dice_standard_styles', 'chat_messages', 'image_assets', 'visual_assets', 'campaign_documents',
]);
