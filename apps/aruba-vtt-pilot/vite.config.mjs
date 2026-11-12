import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root,
  // Keep the ORIGINAL 8-step HSC wizard source unmodified; only replace its
  // Supabase-dependent image picker until Aruba image storage is available.
  plugins:[{
    name:'aruba-legacy-image-safety',
    enforce:'pre',
    resolveId(id,importer){
      if(id==='../ui/tooltip' && importer?.endsWith('/src/app/components/shared/TokenStyleEditor.tsx'))
        return resolve(root,'src/ArubaTooltip.tsx');
      if(id==='./DraggablePortrait' && importer?.endsWith('/src/app/components/session/shared/EntityCard.tsx'))
        return resolve(root,'src/ArubaPortraitPending.tsx');
      if(id==='../../ui/tooltip' && importer?.endsWith('/src/app/components/session/shared/EntityFilterToolbar.tsx'))
        return resolve(root,'src/ArubaTooltip.tsx');
      if(id==='./ui/tooltip' && /\/src\/app\/components\/(FrischezzaTracker|FoliaSpiral)\.tsx$/.test(importer??''))
        return resolve(root,'src/ArubaTooltip.tsx');
      if(id==='../shared/ImageCropUploadModal' && importer?.endsWith('/src/app/components/gm/CharacterCreationWizard.tsx'))
        return resolve(root,'src/ArubaImagePending.tsx');
      return null;
    },
  },react(),tailwindcss()],
  resolve:{alias:{
    react:resolve(root,'node_modules/react'),
    'lucide-react':resolve(root,'node_modules/lucide-react'),
  }},
  base:'/vtt/',
  build:{
    outDir:resolve(root,'../../deploy/aruba/dist/vtt-pilot'),
    emptyOutDir:true,
    target:'es2022',
  },
});
