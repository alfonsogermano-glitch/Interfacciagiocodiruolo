import base from './vite.config.mjs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const root=dirname(fileURLToPath(import.meta.url));
/** Normal VTT application with the real original Notes panel in its
 * right-side navigation, compiled for isolated QA only. */
export default {
 ...base,
 build:{...base.build,
  outDir:resolve(root,'../../deploy/aruba/dist/vtt-notes-navigation-preview'),
  emptyOutDir:true,
 },
};
