import type { Monster } from './monstersTypes';
import { EntityImageExtras } from '../../session/shared/EntityImageExtras';

// ImageEditor/PortraitCropFrame/FrameAssetSelect/CoverFrame sono condivisi
// in shared/PortraitCropEditor.tsx. La logica di orchestrazione (fetch
// cornici, upload cover, tutti gli handler) e' stata generalizzata in
// EntityImageExtras.tsx (Fase 5 della migrazione: estensione a PG/PNG di
// cio' che qui era esclusivo dei Mostri) - questo file resta solo come
// wrapper sottile per non toccare i call site esistenti in
// EntityDetailView.tsx.
export { ImageEditor, PortraitCropFrame } from '../../shared/PortraitCropEditor';

export function MonsterImageExtras({
  monster,
  campaignId,
  onUpdate
}: {
  monster: Monster;
  campaignId: string;
  onUpdate: (monster: Monster) => void;
}) {
  return (
    <EntityImageExtras
      entity={monster}
      campaignId={campaignId}
      entityType="monster"
      storageBucket="monster-images"
      onUpdate={onUpdate}
    />
  );
}
