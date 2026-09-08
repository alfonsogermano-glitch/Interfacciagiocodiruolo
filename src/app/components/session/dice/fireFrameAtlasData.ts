import { FIRE_FRAME_MASK_ATLAS_CHUNK_0 } from './fireFrameMaskAtlasChunk0.ts';
import { FIRE_FRAME_MASK_ATLAS_CHUNK_1 } from './fireFrameMaskAtlasChunk1.ts';
import { FIRE_FRAME_MASK_ATLAS_CHUNK_2 } from './fireFrameMaskAtlasChunk2.ts';
import { FIRE_FRAME_MASK_ATLAS_CHUNK_3 } from './fireFrameMaskAtlasChunk3.ts';
import { FIRE_FRAME_MASK_ATLAS_CHUNK_4 } from './fireFrameMaskAtlasChunk4.ts';

export const FIRE_FRAME_COUNT = 10;
export const FIRE_FRAME_ATLAS_COLUMNS = 5;
export const FIRE_FRAME_ATLAS_ROWS = 2;
export const FIRE_FRAME_DURATION_MS = 140;

export const FIRE_FRAME_MASK_ATLAS_DATA_URL = `data:image/webp;base64,${FIRE_FRAME_MASK_ATLAS_CHUNK_0}${FIRE_FRAME_MASK_ATLAS_CHUNK_1}${FIRE_FRAME_MASK_ATLAS_CHUNK_2}${FIRE_FRAME_MASK_ATLAS_CHUNK_3}${FIRE_FRAME_MASK_ATLAS_CHUNK_4}`;

// Shared alias used by both 2D and 3D Fire animation paths.
export const FIRE_FRAME_ATLAS_DATA_URL = FIRE_FRAME_MASK_ATLAS_DATA_URL;
