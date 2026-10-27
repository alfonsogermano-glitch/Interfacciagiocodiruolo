export interface SessionMapPoiLightConfig {
  color?: string;
  intensity?: number;
}

export interface SessionMapPoi {
  id: string;
  x: number;
  y: number;
  iconName: string;
  color: string;
  visibleToPlayers: boolean;
  locked: boolean;
  /** GM protection: a pinned POI can only be unpinned, not otherwise mutated. */
  pinned: boolean;
  size: number;
  rotation: number;
  lightRadius: number;
  lightConfig?: SessionMapPoiLightConfig;
  noteId: string | null;
  noteVisibleToPlayers: boolean;
  label: string;
  labelVisible: boolean;
  createdByProfileId: string | null;
  createdAt: string;
  updatedAt: string;
}
