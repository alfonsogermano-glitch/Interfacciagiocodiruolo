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
    async resolveId(id,importer){
      // Original sources live above the isolated VTT npm project. Resolve
      // their TipTap imports from this project's real dependency tree; do NOT
      // force nested TipTap extension imports into nonexistent top-level dirs.
      if(id.startsWith('@tiptap/') && importer?.includes('/src/app/'))
        return this.resolve(id,resolve(root,'src/ArubaEntityDependencies.tsx'),{skipSelf:true});
      if(importer?.includes('/src/app/components/') && id.endsWith('/campaigns/RulesetContext'))
        return resolve(root,'src/ArubaEntityDependencies.tsx');
      if(importer?.includes('/src/app/components/') && /^(?:\.\.\/)*ui\/tooltip$/.test(id))
        return resolve(root,'src/ArubaTooltip.tsx');
      // Inline note tools must not activate legacy auth/realtime/dice services.
      // Keep original editor UI while blocking unsupported remote operations.
      if(importer?.includes('/src/app/components/session/shared/')){
        const isolated={
          '../../../auth/AuthContext':'ArubaNoteRuntime.tsx',
          '../../../campaigns/CampaignContext':'ArubaNoteRuntime.tsx',
          '../../../../services/supabase/diceCustomDiceService':'ArubaNoteRuntime.tsx',
          '../dice/DiceSessionContext':'ArubaNoteRuntime.tsx',
        };
        if(Object.hasOwn(isolated,id))return resolve(root,'src/'+isolated[id]);
      }
      // The real EntityDetailView is retained verbatim. Only its backend
      // dependencies are isolated until native Aruba services are ready.
      if(importer?.endsWith('/src/app/components/session/shared/EntityDetailView.tsx')){
        const map={
          './useEntityTabs':'ArubaBaseEntityTabs.ts',
          '../../../campaigns/RulesetContext':'ArubaEntityDependencies.tsx',
          './EntityImageTab':'ArubaEntityDependencies.tsx',
          './EntityImageExtras':'ArubaEntityDependencies.tsx',
          '../../../../services/supabase/entitiesService':'ArubaEntityDependencies.tsx',
          '../../../../services/supabase/charactersService':'ArubaEntityDependencies.tsx',
          '../../../../services/campaign/entityReferenceService':'ArubaEntityDependencies.tsx',
          '../../gm/monsters/MonsterFreschezzaComponents':'ArubaEntityDependencies.tsx',
          '../../gm/monsters/MonsterCatalogComponents':'ArubaEntityDependencies.tsx',
          '../../gm/monsters/monstersUtils':'ArubaEntityDependencies.tsx',
          '../../../../data/monsterTraitsCatalog':'ArubaEntityDependencies.tsx',
          '../../../../data/monsterSpecialActionsCatalog':'ArubaEntityDependencies.tsx',
          './DraggablePortrait':'ArubaPortraitPending.tsx',
        };
        if(Object.hasOwn(map,id))return resolve(root,'src/'+map[id]);
      }
      if(id==='./useEntityTabs' && importer?.endsWith('/src/app/components/session/shared/EntityTabBar.tsx'))
        return resolve(root,'src/ArubaBaseEntityTabs.ts');
      if(id==='../../ui/tooltip' && importer?.endsWith('/src/app/components/session/shared/EntityTabBar.tsx'))
        return resolve(root,'src/ArubaTooltip.tsx');
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
  },{
    name:'aruba-disable-unmigrated-entity-custom-tab-actions',
    enforce:'pre',
    transform(code,id){
      if(!id.endsWith('/src/app/components/session/shared/EntityDetailView.tsx'))return null;
      const from='<EntityTabBar canEdit={canEdit} tabs={tabs} tabIndicators={tabIndicators} />';
      if(!code.includes(from))throw Error('Original EntityDetailView tab contract changed');
      return code.replace(from,
       '<EntityTabBar canEdit={false} tabs={tabs} tabIndicators={tabIndicators} />');
    }
  },react(),tailwindcss()],
  resolve:{alias:{
    react:resolve(root,'node_modules/react'),
    'lucide-react':resolve(root,'node_modules/lucide-react'),
    '@':resolve(root,'../../src'),
  }},
  base:'/vtt/',
  build:{
    outDir:resolve(root,'../../deploy/aruba/dist/vtt-pilot'),
    emptyOutDir:true,
    target:'es2022',
  },
});
