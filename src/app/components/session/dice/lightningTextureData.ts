import { LIGHTNING_TEXTURE_CHUNK_0 } from './lightningTextureChunk0.ts';
import { LIGHTNING_TEXTURE_CHUNK_1 } from './lightningTextureChunk1.ts';
import { LIGHTNING_TEXTURE_CHUNK_2 } from './lightningTextureChunk2.ts';
import { LIGHTNING_TEXTURE_CHUNK_3 } from './lightningTextureChunk3.ts';
import { LIGHTNING_TEXTURE_CHUNK_4 } from './lightningTextureChunk4.ts';
import { LIGHTNING_TEXTURE_CHUNK_5 } from './lightningTextureChunk5.ts';
import { LIGHTNING_TEXTURE_CHUNK_6 } from './lightningTextureChunk6.ts';
import { LIGHTNING_TEXTURE_CHUNK_7 } from './lightningTextureChunk7.ts';

// The GitHub transport altered one base64 character in each of these embedded shards.
// Restore the approved byte-exact payload before assembling the shared texture.
const LIGHTNING_TEXTURE_CHUNK_5_APPROVED = LIGHTNING_TEXTURE_CHUNK_5.replace(
  'VYX5wW2NtoaU4',
  'VYX5wW2NatoaU4',
);
const LIGHTNING_TEXTURE_CHUNK_6_APPROVED = LIGHTNING_TEXTURE_CHUNK_6.replace(
  '7UfxYISE8N',
  '7UfxISE8N',
);

export const LIGHTNING_TEXTURE_SOURCE_DATA_URL = `data:image/webp;base64,${LIGHTNING_TEXTURE_CHUNK_0}${LIGHTNING_TEXTURE_CHUNK_1}${LIGHTNING_TEXTURE_CHUNK_2}${LIGHTNING_TEXTURE_CHUNK_3}${LIGHTNING_TEXTURE_CHUNK_4}${LIGHTNING_TEXTURE_CHUNK_5_APPROVED}${LIGHTNING_TEXTURE_CHUNK_6_APPROVED}${LIGHTNING_TEXTURE_CHUNK_7}`;

// The approved source is already square, so 2D and 3D can share the exact same image.
export const LIGHTNING_TEXTURE_DATA_URL = LIGHTNING_TEXTURE_SOURCE_DATA_URL;
