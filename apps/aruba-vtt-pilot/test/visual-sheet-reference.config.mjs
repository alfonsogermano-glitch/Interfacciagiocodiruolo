import {mergeConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import base from '../vite.config.mjs';
const runtime=fileURLToPath(new URL('./visual-sheet-runtime.tsx',import.meta.url)).replaceAll('\\','/');
const imports=new Set([
 '/utils/supabase/info','../../../services/supabase/charactersService',
 '../../../services/supabase/entitiesService','../../auth/AuthContext',
 '../../campaigns/CampaignContext','../../../services/realtime/campaignChannel',
 '../../campaigns/RulesetContext','../shared/useFolderSection',
]);
// Separate QA config. Never enabled in the production Vite config/bundle.
const originalPlugin={
 name:'isolated-original-sheet-visual-reference',enforce:'pre',
 resolveId(id,importer){
  if(importer?.replaceAll('\\','/').endsWith('/session/SessionCharactersPanel.tsx')&&imports.has(id))return runtime;
 },
};
const config=mergeConfig({...base,plugins:[originalPlugin,...base.plugins]},{
 base:'/vtt/',server:{host:'127.0.0.1',port:4187,strictPort:true},
});
config.server.proxy={};
config.build={...config.build,rollupOptions:{
 ...config.build?.rollupOptions,
 input:fileURLToPath(new URL('./visual-sheet-reference.html',import.meta.url)),
}};
export default config;
