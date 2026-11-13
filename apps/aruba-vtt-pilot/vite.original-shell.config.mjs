import base from './vite.config.mjs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const root=dirname(fileURLToPath(import.meta.url));
/** QA-only build of the real original shell; never merged into pilot dist.
 * Replace only the original TopBar's Supabase boundary imports; its React
 * component and all of its original markup remain untouched. */
const topbarSource='/src/app/layout/TopBar.tsx';
const adapter=resolve(root,'src/ArubaOriginalTopBarAdapter.tsx');
const topbarImports=new Set([
 '../auth/AuthContext',
 '../notifications/NotificationsContext',
 '../campaigns/CampaignContext',
 '../../services/supabase/charactersService',
 '/utils/supabase/info',
]);
export default {
 ...base,
 plugins:[{
  name:'aruba-original-topbar-qa-isolation',
  enforce:'pre',
  resolveId(id,importer){
   if(importer?.endsWith(topbarSource)&&topbarImports.has(id))return adapter;
   return null;
  },
  transform(code,id){
   if(!id.endsWith(topbarSource))return null;
   const original='const SERVER_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-771c5bfd`;';
   if(!code.includes(original))throw Error('Original TopBar server contract changed');
   return code.replace(original,"const SERVER_BASE = '/vtt';");
  },
 },...base.plugins],
 build:{
  ...base.build,
  outDir:resolve(root,'../../deploy/aruba/dist/vtt-original-shell-qa'),
  emptyOutDir:true,
  rollupOptions:{input:[resolve(root,'original-shell.html'),resolve(root,'original-shell-auth.html'),resolve(root,'original-shell-map.html')]},
 },
};
