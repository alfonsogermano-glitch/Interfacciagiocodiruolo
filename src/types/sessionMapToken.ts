import type { CropAreaPercent } from '../app/components/shared/SourceCroppedImage';
import type { TokenBorderStyle, TokenBorderThickness } from './tokenStyle';

export type SessionMapTokenEntityKind = 'pg' | 'png' | 'mostro';

export interface SessionMapTokenVisual {
  entityKind: SessionMapTokenEntityKind;
  entityId: string;
  name: string;
  portraitImageUrl?: string | null;
  portraitSourceImageUrl?: string | null;
  portraitCropArea?: CropAreaPercent | null;
  tokenColor?: string | null;
  tokenBackgroundColor?: string | null;
  tokenBorderStyle?: TokenBorderStyle | null;
  tokenBorderThickness?: TokenBorderThickness | null;
  tokenBorderVisible?: boolean | null;
  tokenBorderLabel?: string | null;
  hiddenFromPlayers?: boolean;
}

export interface SessionMapTokenCondition {
  id: string;
  name: string;
  standardKey?: string;
  custom?: boolean;
}

export interface SessionMapToken extends SessionMapTokenVisual {
  id: string;
  x: number;
  y: number;
  locked?: boolean;
  visible?: boolean;
  showLabel?: boolean;
  labelColor?: string;
  size?: number;
  rotation?: number;
  magnetEnabled?: boolean;
  magnetGroupId?: string | null;
  conditions?: SessionMapTokenCondition[];
  createdAt: string;
  updatedAt: string;
}
