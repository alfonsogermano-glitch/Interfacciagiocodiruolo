export interface SessionMapLightSource {
  enabled: boolean;
  radius: number;
  shape?: 'circle' | 'cone';
  coneAngle?: number;
  coneDirection?: number;
  outlineVisible?: boolean;
  effect?: 'flicker' | 'radiant' | 'flicker-radiant';
  flickerPreset?: 'candle' | 'torch' | 'embers' | 'magic' | 'storm';
}

export interface SessionMapVisionSource {
  enabled: boolean;
  radius: number;
  shape?: 'circle' | 'cone';
  coneAngle?: number;
  coneDirection?: number;
  outlineVisible?: boolean;
}
