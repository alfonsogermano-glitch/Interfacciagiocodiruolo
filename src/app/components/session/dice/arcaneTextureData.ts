import { ARCANE_TEXTURE_CHUNK_0 } from './arcaneTextureChunk0.ts';
import { ARCANE_TEXTURE_CHUNK_1 } from './arcaneTextureChunk1.ts';
import { ARCANE_TEXTURE_CHUNK_2 } from './arcaneTextureChunk2.ts';
import { ARCANE_TEXTURE_CHUNK_3 } from './arcaneTextureChunk3.ts';
import { ARCANE_TEXTURE_CHUNK_4 } from './arcaneTextureChunk4.ts';
import { ARCANE_TEXTURE_CHUNK_5 } from './arcaneTextureChunk5.ts';

const ARCANE_TEXTURE_BASE64 = `${ARCANE_TEXTURE_CHUNK_0}${ARCANE_TEXTURE_CHUNK_1}${ARCANE_TEXTURE_CHUNK_2}${ARCANE_TEXTURE_CHUNK_3}${ARCANE_TEXTURE_CHUNK_4}${ARCANE_TEXTURE_CHUNK_5}`;

export const ARCANE_TEXTURE_SOURCE_DATA_URL = `data:image/webp;base64,${ARCANE_TEXTURE_BASE64}`;
export const ARCANE_TEXTURE_DATA_URL = ARCANE_TEXTURE_SOURCE_DATA_URL;
