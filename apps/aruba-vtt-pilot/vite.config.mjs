import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {maskArubaTrashRow,maskArubaSessionNotesTrashHeader,maskArubaTrashItemPreview} from './src/ArubaSafeNotesTransforms.mjs';
const root=dirname(fileURLToPath(import.meta.url));
// Isolate the original TopBar's legacy services in the actual Aruba pilot.
// The visual component is unchanged; unsupported actions remain fail-closed.
const originalTopbarSource='/src/app/layout/TopBar.tsx';
const originalTopbarAdapter=resolve(root,'src/ArubaOriginalTopBarAdapter.tsx');
const legacyTopbarImports=new Set([
 '../auth/AuthContext','../notifications/NotificationsContext',
 '../campaigns/CampaignContext','../../services/supabase/charactersService',
 '/utils/supabase/info',
]);
export default defineConfig({
  root,
  // Keep the ORIGINAL 8-step HSC wizard source unmodified; only replace its
  // Supabase-dependent image picker until Aruba image storage is available.
  plugins:[{
    name:'aruba-original-topbar-production-isolation',
    enforce:'pre',
    resolveId(id,importer){
      if(importer?.endsWith(originalTopbarSource)&&legacyTopbarImports.has(id))return originalTopbarAdapter;
      return null;
    },
    transform(code,id){
      if(!id.endsWith(originalTopbarSource))return null;
      const original='const SERVER_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-771c5bfd`;';
      if(!code.includes(original)){
        if(code.includes("const SERVER_BASE = '/vtt';"))return null;
        throw Error('Original TopBar server contract changed');
      }
      return code.replace(original,"const SERVER_BASE = '/vtt';");
    },
  },{
    name:'aruba-legacy-image-safety',
    enforce:'pre',
    async resolveId(id,importer){
      // Original sources live above the isolated VTT npm project. Resolve
      // their TipTap imports from this project's real dependency tree; do NOT
      // force nested TipTap extension imports into nonexistent top-level dirs.
      if(id==='aruba-original-session-notes-entry')
        return resolve(root,process.env.HG_CAMPAIGN_NOTES_CONTRACT==='1'?
          'src/ArubaOriginalSessionNotesBoundary.tsx':
          'src/ArubaOriginalNotesDisabled.tsx');
      if(["class-variance-authority","clsx","tailwind-merge","react-popper","@popperjs/core","react-resizable-panels"].includes(id) && importer?.includes('/src/app/'))
        return this.resolve(id,resolve(root,'src/ArubaEntityDependencies.tsx'),{skipSelf:true});
      if((id.startsWith('@radix-ui/')||id==='@iconify/react'||id==='sonner') &&
        importer?.includes('/src/app/'))
        return this.resolve(id,resolve(root,'src/ArubaEntityDependencies.tsx'),{skipSelf:true});
      // Original ImageCropCore lives outside this isolated npm package.
      // Resolve its dependency from the Aruba package, not the legacy root.
      if(id==='react-easy-crop' && importer?.includes('/src/app/'))
        return this.resolve(id,resolve(root,'src/ArubaEntityDependencies.tsx'),{skipSelf:true});
      if(id.startsWith('@tiptap/') && importer?.includes('/src/app/'))
        return this.resolve(id,resolve(root,'src/ArubaEntityDependencies.tsx'),{skipSelf:true});
      if(importer?.includes('/src/app/components/') && id.endsWith('/campaigns/RulesetContext'))
        return resolve(root,'src/ArubaEntityDependencies.tsx');
      if(importer?.includes('/src/app/components/') && /^(?:\.\.\/)*ui\/tooltip$/.test(id))
        return resolve(root,'src/ArubaTooltip.tsx');
      // The original ImageCropCore is reused for its GUI, but all old
      // authentication/storage imports are inert in the Aruba pilot.
      // The new uploadCropped prop supplies the only writable transport.
      if(importer?.endsWith('/src/app/components/shared/ImageCropCore.tsx') &&
         ['../../auth/AuthContext','../../../services/storage/contentAssets'].includes(id))
        return resolve(root,'src/ArubaNoteRuntime.tsx');
      // The original NoteListRow needs the true authenticated cookie context,
      // not the generic disabled editor fallback, in the Campaign Notes build.
      if(process.env.HG_CAMPAIGN_NOTES_CONTRACT==='1' &&
         importer?.endsWith('/src/app/components/session/shared/NoteListRow.tsx') &&
         id==='../../../auth/AuthContext')
        return resolve(root,'src/ArubaCampaignNotesContext.tsx');
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
      if(process.env.HG_CAMPAIGN_NOTES_CONTRACT==='1'){
        if(importer?.endsWith('/src/app/components/session/SessionNotesPanel.tsx')){
          if(id==='../../auth/AuthContext')return resolve(root,'src/ArubaCampaignNotesContext.tsx');
          if(id==='../../campaigns/CampaignContext')return resolve(root,'src/ArubaOriginalPanelSession.tsx');
          if(id==='./shared/useNotesTrash')return resolve(root,'src/ArubaOriginalNotesTrash.ts');
        }
        if(id==='../../../services/supabase/foldersService' &&
         importer?.endsWith('/src/app/components/shared/useFolderSection.tsx'))
          return resolve(root,'src/ArubaOriginalFolderService.ts');
        if(id==='../../../../services/realtime/campaignChannel' &&
         (importer?.endsWith('/src/app/components/shared/useFolderSection.tsx')||
          importer?.endsWith('/src/app/components/session/shared/useCampaignNotesSection.tsx')))
          return resolve(root,'src/ArubaNoLegacyCampaignRealtime.ts');

        if(id==='./useEntityTabs' &&
         (importer?.endsWith('/src/app/components/session/shared/useCampaignNotesSection.tsx')||
          importer?.endsWith('/src/app/components/session/shared/NoteSubTabs.tsx')||
          importer?.endsWith('/src/app/components/session/shared/EntityTabBar.tsx')))
          return resolve(root,'src/ArubaCampaignEntityTabs.ts');
        if(id==='../../../auth/AuthContext' &&
         importer?.endsWith('/src/app/components/session/shared/NoteListRow.tsx'))
          return resolve(root,'src/ArubaCampaignNotesContext.tsx');
        if(id==='../../../../services/supabase/noteTitleIconService' &&
         importer?.endsWith('/src/app/components/session/shared/NoteListRow.tsx'))
          return resolve(root,'src/ArubaOriginalNoteTitleService.ts');
      }
      if(importer?.endsWith('/src/app/components/session/shared/NoteContextualPickers.tsx') &&
        (id==='../../../../lib/supabaseClient'||id==='../../../../services/storage/contentAssets'||id==='../../../auth/AuthContext'))
        return resolve(root,'src/ArubaNoteRuntime.tsx');
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
      if(id==='./useEntityTabs' && importer?.endsWith('/src/app/components/session/shared/NoteSubTabs.tsx'))
        return resolve(root,'src/ArubaBaseEntityTabs.ts');
      if(id==='./useEntityTabs' && importer?.endsWith('/src/app/components/session/shared/EntityTabBar.tsx'))
        return resolve(root,'src/ArubaBaseEntityTabs.ts');
      if(id==='../../ui/tooltip' && importer?.endsWith('/src/app/components/session/shared/EntityTabBar.tsx'))
        return resolve(root,'src/ArubaTooltip.tsx');
      if(id==='../ui/tooltip' && importer?.endsWith('/src/app/components/shared/TokenStyleEditor.tsx'))
        return resolve(root,'src/ArubaTooltip.tsx');
      // EntityCard uses the ORIGINAL local image/token renderer now that
      // portraits are loaded from authenticated Aruba (no Supabase I/O).
      // The EntityDetailView isolation above remains unchanged.
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
      if(process.env.HG_CAMPAIGN_NOTES_CONTRACT==='1' &&
       id.endsWith('/src/app/components/session/shared/TrashRow.tsx'))
        return maskArubaTrashRow(code);
      if(process.env.HG_CAMPAIGN_NOTES_CONTRACT==='1' &&
       id.endsWith('/src/app/components/session/shared/TrashItemPreview.tsx'))
        return maskArubaTrashItemPreview(code);
      if(process.env.HG_CAMPAIGN_NOTES_CONTRACT==='1' &&
       id.endsWith('/src/app/components/session/SessionNotesPanel.tsx'))
        return maskArubaSessionNotesTrashHeader(code);
      if(id.endsWith('/src/app/components/shared/useFolderSection.tsx')){
        const legacy='const SERVER_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-771c5bfd`;';
        if(!code.includes(legacy))throw Error('Original folder hook backend contract changed');
        // The URL is only a historical argument; the Aruba transport ignores
        // it. Strip the legacy hostname from this isolated bundle entirely.
        return code.replace(legacy,"const SERVER_BASE = '/vtt';");
      }
      if(process.env.HG_CAMPAIGN_NOTES_CONTRACT==='1' &&
       id.endsWith('/src/app/components/session/shared/NoteListRow.tsx')){
        const old='await setNoteTitleIcon(note.id, nextIcon);';
        if(!code.includes(old))throw Error('NoteListRow title icon contract changed');
        return code.replace(old,'await setNoteTitleIcon(runtimeNote.campaign_id, note.id, nextIcon);');
      }
      if(!id.endsWith('/src/app/components/session/shared/EntityDetailView.tsx'))return null;
      const from='<EntityTabBar canEdit={canEdit} tabs={tabs} tabIndicators={tabIndicators} />';
      if(!code.includes(from))throw Error('Original EntityDetailView tab contract changed');
      // Original EntityDetailView custom character tabs are direct RichTextEditor.
      // Nested NoteSubTabs belong to Campaign Notes, NOT this panel.
      return "import {ArubaEntityTabBar} from '@aruba-notes/ArubaNotesCapability';\n"+
        code.replace(from,
         '<ArubaEntityTabBar canEdit={canEdit} tabs={tabs} tabIndicators={tabIndicators} />');
    }
  },react(),tailwindcss()],
  resolve:{alias:{
    react:resolve(root,'node_modules/react'),
    'lucide-react':resolve(root,'node_modules/lucide-react'),
    '@':resolve(root,'../../src'),
    '@aruba-notes':resolve(root,'src'),
  }},
  base:'/vtt/',
  build:{
    outDir:resolve(root,'../../deploy/aruba/dist/vtt-pilot'),
    emptyOutDir:true,
    target:'es2022',
  },
});
