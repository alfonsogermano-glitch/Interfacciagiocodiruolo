import {defineConfig} from 'vite';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const root=path.resolve(__dirname);
const originalAuth=path.resolve(root,'src/app/auth/AuthContext.tsx');
const originalCampaign=path.resolve(root,'src/app/campaigns/CampaignContext.tsx');
const originalSupabase=path.resolve(root,'src/lib/supabaseClient.ts');
export default defineConfig({
  plugins:[{name:'controlled-original-fixture',enforce:'pre',resolveId(id,importer){if(!importer)return null;const resolved=path.resolve(path.dirname(importer),id);if(resolved===originalAuth.slice(0,-4)||resolved===originalAuth)return path.resolve(root,'deploy/aruba/qa/original-fixture/AuthContext.tsx');if(resolved===originalCampaign.slice(0,-4)||resolved===originalCampaign)return path.resolve(root,'deploy/aruba/qa/original-fixture/CampaignContext.tsx');if(resolved===originalSupabase.slice(0,-3)||resolved===originalSupabase)return path.resolve(root,'deploy/aruba/qa/original-fixture/supabaseClient.ts');return null;}},react({babel:{compact:false}}),tailwindcss()],
  resolve:{alias:{'@':path.resolve(root,'src')}},
  assetsInclude:['**/*.svg','**/*.csv'],
  server:{host:'127.0.0.1',port:4174,strictPort:true},
  build:{outDir:'deploy/aruba/dist/original-visual-baseline',emptyOutDir:true},
});
