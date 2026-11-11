import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root,
  plugins:[react()],
  base:'/vtt/',
  build:{
    outDir:resolve(root,'../../deploy/aruba/dist/vtt-pilot'),
    emptyOutDir:true,
    target:'es2022',
  },
});
