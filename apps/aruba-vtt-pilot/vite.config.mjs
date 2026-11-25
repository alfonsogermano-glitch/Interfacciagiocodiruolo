import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {fileURLToPath} from 'node:url';
import {resolve as resolvePath,dirname} from 'node:path';
import {readFileSync} from 'node:fs';
import {maskArubaTrashRow,maskArubaSessionNotesTrashHeader,maskArubaTrashItemPreview} from './src/ArubaSafeNotesTransforms.mjs';
import {localLandingPlugin} from './local-landing-plugin.mjs';
import {acknowledgeOriginalCatalogCreation} from './src/ArubaCatalogTransforms.mjs';
// Rollup module IDs use forward slashes. Returning Windows backslash paths
// from resolveId creates duplicate React context modules with separate state.
const resolve=(...parts)=>resolvePath(...parts).replaceAll('\\','/');
const root=dirname(fileURLToPath(import.meta.url));
// Ship the migrated Notes panel; backend capabilities and ownership still
// gate access. An explicit 0 keeps an emergency build-time opt-out.
const campaignNotesEnabled=process.env.HG_CAMPAIGN_NOTES_CONTRACT!=='0';
const localHttps=process.env.HG_LOCAL_HTTPS==='1'?{
  key:readFileSync(resolve(root,'../../certs/local/localhost-key.pem')),
  cert:readFileSync(resolve(root,'../../certs/local/localhost-cert.pem')),
}:false;
const bypassVttFrontend=(req)=>{
  if(req.method!=='GET')return;
  const url=req.url||'';
  const accept=String(req.headers.accept||'');
  if(url==='/vtt/'||url==='/vtt'||accept.includes('text/html'))return '/index.html';
  if(url.startsWith('/vtt/@')||url.startsWith('/vtt/src/')||
    /\.[a-z0-9]+(?:\?|$)/i.test(url)) return url.replace(/^\/vtt/,'');
};
// Isolate the original TopBar's legacy services in the actual Aruba pilot.
// The visual component is unchanged; unsupported actions remain fail-closed.
const originalTopbarSource='/src/app/layout/TopBar.tsx';
const originalTopbarAdapter=resolve(root,'src/ArubaOriginalTopBarAdapter.tsx');
// The ORIGINAL EntityImageExtras/PortraitCropEditor UI is reused verbatim.
// Their legacy data transports are inert; covers and frames persist only in
// the Aruba visual-asset store through the authenticated content endpoint.
const entityImageRuntime='ArubaImageRuntime.ts';
const entityImageImports={
  '../../../auth/AuthContext':entityImageRuntime,
  '../../../../lib/supabaseClient':entityImageRuntime,
  '../../../../services/storage/contentAssets':entityImageRuntime,
  '../../../../services/storage/visualAssetsStorage':'ArubaVisualAssetsStorage.ts',
};
const legacyTopbarImports=new Set([
 '../auth/AuthContext','../notifications/NotificationsContext',
 '../campaigns/CampaignContext','../../services/supabase/charactersService',
 '/utils/supabase/info',
]);
export default defineConfig({
  root,
  publicDir:resolve(root,'../../public'),
  // Keep the ORIGINAL 8-step HSC wizard source unmodified; only replace its
  // Supabase-dependent image picker until Aruba image storage is available.
  plugins:[...(process.env.HG_LOCAL_FULL==='1'?[localLandingPlugin({root})]:[]),{
    name:'aruba-original-game-map-isolation',
    enforce:'pre',
    generateBundle(_options,bundle){
      if(process.env.HG_CATALOG_CONTRACT!=='1')return;
      for(const chunk of Object.values(bundle)){
       if(chunk.type!=='chunk')continue;
       for(const id of Object.keys(chunk.modules)){
        if(/\/src\/lib\/supabaseClient\.[jt]s$|\/node_modules\/@supabase\//.test(id))
          this.error('Legacy Supabase runtime: '+id+' imported by '+this.getModuleInfo(id)?.importers.join(', '));
       }
      }
    },
     resolveId(id,importer){
      if(id==='aruba-original-catalog-entry')return resolve(root,
        process.env.HG_CATALOG_CONTRACT==='1'?'src/ArubaOriginalCatalog.tsx':'src/ArubaCatalogUnavailable.tsx');
      if(importer?.endsWith('/src/hooks/useJoinByCodeFlow.ts')){
        if(id==='../app/auth/AuthContext')return originalTopbarAdapter;
        if(id==='../app/campaigns/CampaignContext')return resolve(root,'src/ArubaOriginalCatalog.tsx');
        if(id==='../services/supabase/charactersService')return resolve(root,'src/ArubaCatalogService.ts');
        if(id==='/utils/supabase/info')return resolve(root,'src/ArubaNoSupabaseInfo.ts');
      }
      if(importer?.endsWith('/src/app/components/gm/MyCharactersPage.tsx')){
        if(id==='../../campaigns/CampaignContext')return resolve(root,'src/ArubaOriginalCatalog.tsx');
        if(id==='../../../services/realtime/campaignChannel')return resolve(root,'src/ArubaCatalogRealtime.ts');
        if(id==='../../../services/storage/persistenceMode')return resolve(root,'src/ArubaEncounterPersistenceMode.ts');
      }
       if(importer?.includes('/src/app/components/session/')&&id.endsWith('/DiceAppearanceContext'))return resolve(root,'src/ArubaDiceAppearanceContext.tsx');
       if(importer?.includes('/src/app/components/session/dice/')){
         if(id==='../../../auth/AuthContext'||id==='../../../campaigns/CampaignContext'||id==='./DiceSessionContext'||id==='./Dice3DOverlay')
           return resolve(root,'src/ArubaDiceTools.tsx');
         if(id==='../../../../services/supabase/diceFormulasService')return resolve(root,'src/ArubaDiceFormulasService.ts');
         if(id==='../../../../services/supabase/diceFormulaFoldersService'||id==='../../../../services/supabase/diceCustomDiceService')
           return resolve(root,'src/ArubaNoteRuntime.tsx');
       }
       // Specific Notes contexts must win over the generic original-shell
       // aliases below, or opening Notes throws "Campaign scope mancante".
       if(campaignNotesEnabled&&importer?.endsWith('/src/app/components/session/SessionNotesPanel.tsx')){
         if(id==='../../auth/AuthContext')return resolve(root,'src/ArubaCampaignNotesContext.tsx');
         if(id==='../../campaigns/CampaignContext')return resolve(root,'src/ArubaOriginalPanelSession.tsx');
       }
       if(campaignNotesEnabled&&importer?.endsWith('/src/app/components/session/shared/NoteListRow.tsx')&&id==='../../../auth/AuthContext')
         return resolve(root,'src/ArubaCampaignNotesContext.tsx');
       if(importer?.includes('/src/app/components/session/shared/')&&
          (id==='../../../campaigns/CampaignContext'||id==='../../../auth/AuthContext'))
         return resolve(root,'src/ArubaNoteRuntime.tsx');
       if((importer?.includes('/src/app/')||importer?.includes('/src/services/'))&&/(?:\.\.\/)+(?:app\/)?auth\/AuthContext$/.test(id))return resolve(root,'src/ArubaOriginalTopBarAdapter.tsx');
      if(importer?.includes('/src/app/')&&/(?:\.\.\/)+campaigns\/CampaignContext$/.test(id))return resolve(root,'src/ArubaCampaignScopeContext.tsx');
      if((importer?.endsWith('/src/app/components/gm/GameMap.tsx')||importer?.endsWith('/src/app/components/shared/useCampaignDocument.ts'))&&id==='../../campaigns/CampaignContext')return resolve(root,'src/ArubaCampaignScopeContext.tsx');
      if(importer?.endsWith('/src/app/components/session/shared/EntityImageExtras.tsx')&&Object.hasOwn(entityImageImports,id))return resolve(root,'src/'+entityImageImports[id]);
      if(importer?.endsWith('/src/app/components/shared/PortraitCropEditor.tsx')&&id==='../../../services/storage/visualAssetsStorage')return resolve(root,'src/ArubaVisualAssetsStorage.ts');
      if(importer?.endsWith('/src/app/components/gm/CombatTracker.tsx')&&id==='../../campaigns/CampaignContext')return resolve(root,'src/ArubaCampaignScopeContext.tsx');
      if(importer?.endsWith('/src/app/components/gm/CombatTracker.tsx')&&id==='../../../services/supabase/entitiesService')return resolve(root,'src/ArubaCombatEntitiesService.ts');
      if(importer?.endsWith('/src/app/components/gm/SceneEncounterManager.tsx')){
        if(id==='../../campaigns/CampaignContext')return resolve(root,'src/ArubaCampaignScopeContext.tsx');
        if(id==='../../../services/supabase/entitiesService')return resolve(root,'src/ArubaEncounterEntitiesService.ts');
        if(id==='../../../services/storage/persistenceMode')return resolve(root,'src/ArubaEncounterPersistenceMode.ts');
        if(id==='../../../lib/supabaseClient')return resolve(root,'src/ArubaEncounterNarrativeClient.ts');
        if(id==='../session/useActiveScene')return resolve(root,'src/ArubaEncounterActiveScene.ts');
      }
      if(importer?.includes('/src/app/components/session/')&&/(?:CampaignChatPanel|SessionChatPanel|PrivateChatPanel|ChatImageAttachment)\.tsx$/.test(importer)){
        if(id==='../../auth/AuthContext'||id==='../../../auth/AuthContext')return resolve(root,'src/ArubaOriginalTopBarAdapter.tsx');
        if(id==='../../campaigns/CampaignContext')return resolve(root,'src/ArubaCampaignScopeContext.tsx');
        if(id==='../../../services/realtime/campaignChannel')return resolve(root,'src/ArubaSessionCampaignChannel.ts');
        if(id==='../../../services/storage/persistenceMode')return resolve(root,'src/ArubaChatPersistenceMode.ts');
        if(id==='../../../services/supabase/chatService')return resolve(root,'src/ArubaChatService.ts');
        if(id==='../../../services/supabase/privateChatService')return resolve(root,'src/ArubaPrivateChatService.ts');
        if(id==='./chatAttachments')return resolve(root,'src/ArubaChatAttachments.ts');
        if(id==='../../../services/storage/contentAssets')return resolve(root,'src/ArubaChatContentAssets.ts');
        if(id==='./dice/DiceSessionContext')return resolve(root,'src/ArubaChatDiceSession.ts');
        if(id==='../../../../services/supabase/diceFormulasService')return resolve(root,'src/ArubaDiceFormulasService.ts');
        if(id==='../../../../services/supabase/diceFormulaFoldersService')return resolve(root,'src/ArubaNoteRuntime.tsx');
        if(id==='../../../../services/supabase/diceCustomDiceService')return resolve(root,'src/ArubaNoteRuntime.tsx');
      }
      if(importer?.endsWith('/src/app/components/session/SessionWorkspace.tsx')){
        if(id==='../../../services/supabase/entitiesService')return resolve(root,'src/ArubaSessionEntitiesService.ts');
        if(id==='../../../services/realtime/campaignChannel')return resolve(root,'src/ArubaSessionCampaignChannel.ts');
        if(id==='./useActiveScene')return resolve(root,'src/ArubaSessionActiveScene.ts');
      }
      if(importer?.endsWith('/src/app/components/session/MapViewport.tsx')){
        if(id==='../../../services/realtime/campaignChannel')return resolve(root,'src/ArubaSessionCampaignChannel.ts');
        if(id==='/utils/supabase/info')return resolve(root,'src/ArubaNoSupabaseInfo.ts');
      }
      if(importer?.endsWith('/src/app/components/gm/VisualAssetsManager.tsx')&&id==='../../../services/storage/visualAssetsStorage')return resolve(root,'src/ArubaVisualAssetsStorage.ts');
      if(importer?.endsWith('/src/app/components/gm/VisualAssetsManager.tsx')&&id==='../../../lib/supabaseClient')return resolve(root,'src/ArubaVisualAssetsSupabase.ts');
      if(importer?.endsWith('/src/app/components/gm/VisualAssetsManager.tsx')&&id==='../../auth/AuthContext')return resolve(root,'src/ArubaVisualAssetsAuth.ts');
      if(importer?.endsWith('/src/app/components/gm/MyCharactersPage.tsx')){
        if(id==='../../../services/supabase/charactersService')return resolve(root,'src/ArubaCatalogService.ts');
        if(id==='../../../services/supabase/entitiesService')return resolve(root,'src/ArubaCatalogService.ts');
        if(id==='../../../services/supabase/entityNotesService')return resolve(root,'src/ArubaCatalogService.ts');
        if(id==='../../auth/AuthContext')return resolve(root,'src/ArubaOriginalTopBarAdapter.tsx');
        if(id==='../../campaigns/CampaignContext')return resolve(root,'src/ArubaCampaignScopeContext.tsx');
        if(id==='../../campaigns/RulesetContext')return resolve(root,'src/ArubaEntityDependencies.tsx');
        if(id==='/utils/supabase/info')return resolve(root,'src/ArubaNoSupabaseInfo.ts');
      }
      if(importer?.endsWith('/src/app/components/shared/useCampaignDocument.ts')&&id==='../../../services/storage/campaignDocuments')return resolve(root,'src/ArubaCampaignDocuments.ts');
      return null;
    },
  },{
    name:'aruba-original-shell-assets',
    enforce:'pre',
    transform(code,id){
      if(id.endsWith('/src/app/components/gm/MyCharactersPage.tsx')||id.endsWith('/src/hooks/useJoinByCodeFlow.ts')){
        const legacy='const SERVER_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-771c5bfd`;';
        if(!code.includes(legacy))throw Error('Original catalog server contract changed');
        const isolated=code.replace(legacy,"const SERVER_BASE = '/vtt';");
        return id.endsWith('/MyCharactersPage.tsx')?acknowledgeOriginalCatalogCreation(isolated):isolated;
      }
      if(id.endsWith('/src/app/layout/LeftSidebar.tsx')){
        if(!code.includes('src="/hollowgate-logo.png"'))throw Error('Original LeftSidebar logo contract changed');
        if(!code.includes('src="/icon-source-1024.png"'))throw Error('Original LeftSidebar campaign icon contract changed');
        return code
          .replace('src="/hollowgate-logo.png"','src="/vtt/hollowgate-logo.png"')
          .replace('src="/icon-source-1024.png"','src="/vtt/icon-source-1024.png"');
      }
      if(id.endsWith('/src/app/components/shared/CampaignBannerDisplay.tsx')){
        if(!code.includes('src="/icon-source-1024.png"'))throw Error('Original CampaignBannerDisplay logo contract changed');
        return code.replace('src="/icon-source-1024.png"','src="/vtt/icon-source-1024.png"');
      }
      if(id.includes('/src/app/')&&code.includes('src="/icon-source-1024.png"'))
        return code.replaceAll('src="/icon-source-1024.png"','src="/vtt/icon-source-1024.png"');
      return null;
    },
  },{
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
      if(importer?.includes('/src/services/')&&/(?:\.\.\/)+lib\/supabaseClient$/.test(id))
        return resolve(root,'src/ArubaBlockedLegacyClient.ts');
      // Original sources live above the isolated VTT npm project. Resolve
      // their TipTap imports from this project's real dependency tree; do NOT
      // force nested TipTap extension imports into nonexistent top-level dirs.
      if(id==='aruba-original-session-notes-entry')
         return resolve(root,campaignNotesEnabled?
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
       if(campaignNotesEnabled &&
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
       if(campaignNotesEnabled){
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
      if(id==='../../ui/tooltip' && importer?.endsWith('/src/app/components/gm/monsters/MonsterFreschezzaComponents.tsx'))
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
       if(campaignNotesEnabled &&
       id.endsWith('/src/app/components/session/shared/TrashRow.tsx'))
        return maskArubaTrashRow(code);
       if(campaignNotesEnabled &&
       id.endsWith('/src/app/components/session/shared/TrashItemPreview.tsx'))
        return maskArubaTrashItemPreview(code);
       if(campaignNotesEnabled &&
       id.endsWith('/src/app/components/session/SessionNotesPanel.tsx'))
        return maskArubaSessionNotesTrashHeader(code);
      if(id.endsWith('/src/app/components/shared/useFolderSection.tsx')){
        const legacy='const SERVER_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-771c5bfd`;';
        if(!code.includes(legacy))throw Error('Original folder hook backend contract changed');
        // The URL is only a historical argument; the Aruba transport ignores
        // it. Strip the legacy hostname from this isolated bundle entirely.
        return code.replace(legacy,"const SERVER_BASE = '/vtt';");
      }
       if(campaignNotesEnabled &&
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
     three:resolve(root,'node_modules/three'),
     '@3d-dice/dice-box-threejs':resolve(root,'node_modules/@3d-dice/dice-box-threejs/dist/dice-box-threejs.es.js'),
    'lucide-react':resolve(root,'node_modules/lucide-react'),
    '@':resolve(root,'../../src'),
    '@aruba-notes':resolve(root,'src'),
  }},
  base:localHttps?'/':'/vtt/',
   build:{
    outDir:resolve(root,'../../deploy/aruba/dist/vtt-pilot'),
    emptyOutDir:true,
     target:'es2022',
   },
   // Preview serves the compiled artifact only. Inheriting the dev /vtt proxy
   // would send the SPA document to the API instead of testing the build.
   preview:{proxy:{}},
   server:{
    host:'127.0.0.1',
    port:5173,
    strictPort:true,
    https:localHttps,
    proxy:{
      '/vtt':{ target:'http://localhost:3000', changeOrigin:true, bypass:bypassVttFrontend },
      '/auth':{ target:'http://localhost:3000', changeOrigin:true },
    },
  },
});
