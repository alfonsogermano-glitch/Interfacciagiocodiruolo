import { createPortal } from 'react-dom';
import { usePortalContainer } from '../../ui/portal-container';
import { TokenShapePreview } from '../../shared/TokenShapePreview';
import { EntityPortraitImage } from '../../shared/EntityPortraitImage';
import { TOKEN_SHAPE_SPECS, getTokenStrokeWidth } from '../../shared/tokenShapes';
import {
  DEFAULT_TOKEN_COLOR,
  DEFAULT_TOKEN_BACKGROUND_COLOR,
  DEFAULT_TOKEN_BORDER_STYLE,
  DEFAULT_TOKEN_BORDER_THICKNESS,
  DEFAULT_TOKEN_BORDER_VISIBLE,
  type TokenBorderStyle,
  type TokenBorderThickness,
} from '../../../../types/tokenStyle';
import type { CropAreaPercent } from '../../shared/SourceCroppedImage';

const TOKEN_SIZE = 64;
const IDENTITY_CROP = { x: 0, y: 0, scale: 1 };

export interface TokenDragGhostEntity {
  id: string;
  name: string;
  portraitImageUrl?: string | null;
  portraitSourceImageUrl?: string | null;
  portraitCropArea?: CropAreaPercent | null;
  tokenColor?: string | null;
  tokenBackgroundColor?: string | null;
  tokenBorderStyle?: TokenBorderStyle | null;
  tokenBorderThickness?: TokenBorderThickness | null;
  tokenBorderVisible?: boolean | null;
}

/**
 * Fantasma di drag unificato (Fase 3) per i due punti di trascinamento di
 * SessionCharactersPanel.tsx (thumbnail nella lista laterale e ritratto
 * grande nel dettaglio) - prima ciascuno aveva la propria resa nativa
 * (rispettivamente lo snapshot di default del browser e un
 * dataTransfer.setDragImage con TokenShapePreview dentro DraggablePortrait),
 * ora un solo ghost condiviso, stesso principio del portal-che-segue-il-
 * puntatore gia' usato da DragGhost.tsx per il drag di cartelle/card.
 * Nessuna chiamata di rete/stato qui dentro: riceve solo dati grezzi
 * dall'hook (pointerPosition) e l'entita' trascinata gia' risolta dal
 * chiamante (SessionCharactersPanel non conosce l'hook useFolderDragDrop
 * per "entityType" qui - lo scopo e' identico a DragGhost ma per un'entita'
 * singola invece di folders/items di una sezione).
 */
export function TokenDragGhost({
  entity,
  pointerPosition,
  fallbackIcon,
  insideList = false,
}: {
  entity: TokenDragGhostEntity | null;
  pointerPosition: { x: number; y: number } | null;
  fallbackIcon: React.ReactNode;
  /** Vero quando il puntatore e' attualmente dentro i confini della colonna
   *  lista (vedi isPointerOverList in SessionCharactersPanel.tsx, ricalcolato
   *  ad ogni pointermove) - fa disegnare una piccola scheda in trasparenza
   *  (coerente con la riga della lista) invece del token tondo pensato per
   *  il rilascio fuori dalla lista (es. la Mappa futura). Default false =
   *  comportamento invariato per l'unico chiamante attuale finche' non passa
   *  esplicitamente la posizione. */
  insideList?: boolean;
}) {
  const portalContainer = usePortalContainer();
  if (!entity || !pointerPosition) return null;

  const ghostStyle: React.CSSProperties = {
    position: 'fixed', left: pointerPosition.x + 14, top: pointerPosition.y + 14, zIndex: 2000,
  };

  if (insideList) {
    return createPortal(
      <div
        style={ghostStyle}
        className="pointer-events-none flex max-w-[200px] items-center gap-2 rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)]/80 px-2 py-1.5 opacity-80 shadow-2xl"
      >
        <div className="h-8 w-8 shrink-0 overflow-hidden rounded-md bg-[var(--dash-input)]">
          {entity.portraitImageUrl || (entity.portraitSourceImageUrl && entity.portraitCropArea) ? (
            <EntityPortraitImage
              portraitImageUrl={entity.portraitImageUrl}
              portraitSourceImageUrl={entity.portraitSourceImageUrl}
              portraitCropArea={entity.portraitCropArea}
              alt={entity.name}
              style={{ width: '100%', height: '100%' }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">{fallbackIcon}</div>
          )}
        </div>
        <span className="min-w-0 truncate text-sm font-medium text-[var(--dash-text-strong)]">{entity.name}</span>
      </div>,
      portalContainer ?? document.body
    );
  }

  const color = entity.tokenColor ?? DEFAULT_TOKEN_COLOR;
  const backgroundColor = entity.tokenBackgroundColor ?? DEFAULT_TOKEN_BACKGROUND_COLOR;
  const style = entity.tokenBorderStyle ?? DEFAULT_TOKEN_BORDER_STYLE;
  const thickness = entity.tokenBorderThickness ?? DEFAULT_TOKEN_BORDER_THICKNESS;
  const borderVisible = entity.tokenBorderVisible ?? DEFAULT_TOKEN_BORDER_VISIBLE;
  const geometry = TOKEN_SHAPE_SPECS[style].geometry;
  const strokeWidth = getTokenStrokeWidth(style, thickness);

  return createPortal(
    <div style={ghostStyle} className="pointer-events-none opacity-90 shadow-2xl">
      <TokenShapePreview
        clipId={`session-drag-ghost-${entity.id}`}
        name={entity.name}
        portraitImageUrl={entity.portraitImageUrl}
        portraitSourceImageUrl={entity.portraitSourceImageUrl}
        portraitCropArea={entity.portraitCropArea}
        fallbackContent={!entity.portraitImageUrl ? fallbackIcon : undefined}
        crop={IDENTITY_CROP}
        color={color}
        backgroundColor={backgroundColor}
        geometry={geometry}
        strokeWidth={strokeWidth}
        borderVisible={borderVisible}
        style={{ width: TOKEN_SIZE, height: TOKEN_SIZE }}
      />
    </div>,
    portalContainer ?? document.body
  );
}
