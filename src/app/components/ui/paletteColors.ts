export type PaletteId = 'cthulhu' | 'blood' | 'amber' | 'emerald' | 'arcane' | 'noir' | 'frost' | 'violet' | 'questportal';

export interface PaletteColors {
  panel: string;
  text: string;
  border: string;
}

export const PALETTE_COLORS: Record<PaletteId, PaletteColors> = {
  cthulhu:     { panel: '#211918', text: '#f3e7d0', border: '#4e3325' },
  blood:       { panel: '#281313', text: '#ffe4dc', border: '#673232' },
  amber:       { panel: '#2a2112', text: '#fff0cf', border: '#6a4a24' },
  emerald:     { panel: '#16291f', text: '#effff5', border: '#2f6a4a' },
  arcane:      { panel: '#162237', text: '#edf6ff', border: '#315a83' },
  noir:        { panel: '#202020', text: '#f4efe8', border: '#4a4a4a' },
  frost:       { panel: '#172b33', text: '#f0fbff', border: '#356879' },
  violet:      { panel: '#281d36', text: '#f6efff', border: '#634383' },
  questportal: { panel: '#1e2030', text: '#ffffff', border: '#2a2b3d' },
};

export const DEFAULT_PALETTE_COLORS: PaletteColors = PALETTE_COLORS.noir;
