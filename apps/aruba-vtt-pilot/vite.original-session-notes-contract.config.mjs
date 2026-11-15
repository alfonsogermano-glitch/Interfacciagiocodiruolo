import base from './vite.config.mjs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const root=dirname(fileURLToPath(import.meta.url));
export default {
 ...base,build:{...base.build,
  outDir:resolve(root,'../../deploy/aruba/dist/vtt-original-session-notes-contract'),
  emptyOutDir:true,
  rollupOptions:{input:resolve(root,'src/ArubaOriginalSessionNotesBoundary.tsx')},
 },
};
