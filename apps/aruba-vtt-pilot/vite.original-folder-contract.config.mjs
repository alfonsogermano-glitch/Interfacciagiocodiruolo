import base from './vite.config.mjs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const root=dirname(fileURLToPath(import.meta.url));
/** Compile the REAL original folder hook through Aruba-only import aliases.
 * This produces a throwaway entry chunk; it is not mounted in the UI. */
export default {
 ...base,
 build:{
  ...base.build,
  outDir:resolve(root,'../../deploy/aruba/dist/vtt-original-folder-contract'),
  emptyOutDir:true,
  rollupOptions:{input:resolve(root,'src/ArubaOriginalFolderBoundary.tsx')},
 },
};
