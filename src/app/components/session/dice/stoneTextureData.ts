import { STONE_TEXTURE_CHUNK_0 } from './stoneTextureChunk0.ts';
import { STONE_TEXTURE_CHUNK_1 } from './stoneTextureChunk1.ts';
import { STONE_TEXTURE_CHUNK_2 } from './stoneTextureChunk2.ts';
import { STONE_TEXTURE_CHUNK_3 } from './stoneTextureChunk3.ts';

const STONE_TEXTURE_BASE64 = `${STONE_TEXTURE_CHUNK_0}${STONE_TEXTURE_CHUNK_1}${STONE_TEXTURE_CHUNK_2}${STONE_TEXTURE_CHUNK_3}`;

export const STONE_TEXTURE_SOURCE_DATA_URL = `data:image/webp;base64,${STONE_TEXTURE_BASE64}`;
export const STONE_TEXTURE_DATA_URL = STONE_TEXTURE_SOURCE_DATA_URL;
