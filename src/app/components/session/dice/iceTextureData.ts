import { ICE_TEXTURE_CHUNK_0 } from './iceTextureChunk0.ts';
import { ICE_TEXTURE_CHUNK_1 } from './iceTextureChunk1.ts';
import { ICE_TEXTURE_CHUNK_2 } from './iceTextureChunk2.ts';
import { ICE_TEXTURE_CHUNK_3 } from './iceTextureChunk3.ts';
import { ICE_TEXTURE_CHUNK_4 } from './iceTextureChunk4.ts';
import { ICE_TEXTURE_CHUNK_5 } from './iceTextureChunk5.ts';

const ICE_TEXTURE_SOURCE_DATA_URL = `data:image/webp;base64,${ICE_TEXTURE_CHUNK_0}${ICE_TEXTURE_CHUNK_1}${ICE_TEXTURE_CHUNK_2}${ICE_TEXTURE_CHUNK_3}${ICE_TEXTURE_CHUNK_4}${ICE_TEXTURE_CHUNK_5}`;
const ICE_TEXTURE_SQUARE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><image href="${ICE_TEXTURE_SOURCE_DATA_URL}" width="512" height="512" preserveAspectRatio="xMidYMid slice"/></svg>`;

export const ICE_TEXTURE_DATA_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(ICE_TEXTURE_SQUARE_SVG)}`;
