import { LIGHTNING_TEXTURE_CHUNK_0 } from './lightningTextureChunk0.ts';
import { LIGHTNING_TEXTURE_CHUNK_1 } from './lightningTextureChunk1.ts';
import { LIGHTNING_TEXTURE_CHUNK_2 } from './lightningTextureChunk2.ts';
import { LIGHTNING_TEXTURE_CHUNK_3 } from './lightningTextureChunk3.ts';
import { LIGHTNING_TEXTURE_CHUNK_4 } from './lightningTextureChunk4.ts';
import { LIGHTNING_TEXTURE_CHUNK_5 } from './lightningTextureChunk5.ts';
import { LIGHTNING_TEXTURE_CHUNK_6 } from './lightningTextureChunk6.ts';
import { LIGHTNING_TEXTURE_CHUNK_7 } from './lightningTextureChunk7.ts';

export const LIGHTNING_TEXTURE_SOURCE_DATA_URL = `data:image/webp;base64,${LIGHTNING_TEXTURE_CHUNK_0}${LIGHTNING_TEXTURE_CHUNK_1}${LIGHTNING_TEXTURE_CHUNK_2}${LIGHTNING_TEXTURE_CHUNK_3}${LIGHTNING_TEXTURE_CHUNK_4}${LIGHTNING_TEXTURE_CHUNK_5}${LIGHTNING_TEXTURE_CHUNK_6}${LIGHTNING_TEXTURE_CHUNK_7}`;

// The approved source is already square, so 2D and 3D can share the exact same image.
export const LIGHTNING_TEXTURE_DATA_URL = LIGHTNING_TEXTURE_SOURCE_DATA_URL;
