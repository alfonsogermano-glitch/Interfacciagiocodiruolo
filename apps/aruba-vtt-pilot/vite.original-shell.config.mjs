import base from './vite.config.mjs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const root=dirname(fileURLToPath(import.meta.url));
/** QA-only build of the real original shell; never merged into pilot dist. */
export default {
 ...base,
 build:{
  ...base.build,
  outDir:resolve(root,'../../deploy/aruba/dist/vtt-original-shell-qa'),
  emptyOutDir:true,
  rollupOptions:{input:resolve(root,'original-shell.html')},
 },
};
