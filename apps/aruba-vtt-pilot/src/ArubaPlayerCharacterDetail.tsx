import {useEffect,useState} from 'react';
import {ArrowLeft} from 'lucide-react';
import {EntityDetailView} from '../../../src/app/components/session/shared/EntityDetailView';
import {SlideOverPanel} from '../../../src/app/components/session/SlideOverPanel';
import {EntityDetailRail,type EntityDetailRailSection} from '../../../src/app/components/session/shared/EntityDetailRail';
import {listAssignedPlayerCharacters,readCharacterPortrait} from './client.mjs';
import {loadAuthorizedPlayerVisualAssets} from './ArubaPlayerVisualAssets';
import {resolveAuthorizedPlayerMedia} from './player-visual-assets.mjs';
import type {VisualAsset} from './ArubaVisualAssetsStorage';
import type {Character} from '../../../src/types/character';

/** Reauthorizes a player assignment before mounting the original read-only
 * detail. It never uses an owner write endpoint or trusts the card snapshot. */
export function ArubaPlayerCharacterDetail({campaignId,characterId,portraitsEnabled,visualAssetsEnabled=false,onClose}:{
 campaignId:string;characterId:string;portraitsEnabled:boolean;visualAssetsEnabled?:boolean;onClose:()=>void;
}){
 const [sheet,setSheet]=useState<any|null>(null);
 const [portrait,setPortrait]=useState<string|null>(null);
 const [visualAssets,setVisualAssets]=useState<VisualAsset[]>([]);
 const [section,setSection]=useState<EntityDetailRailSection>('scheda');
 const [error,setError]=useState<string|null>(null);
 useEffect(()=>{
  let active=true;setSheet(null);setPortrait(null);setVisualAssets([]);setError(null);
  void listAssignedPlayerCharacters(fetch,campaignId).then(async rows=>{
   const authorized=rows.find(row=>row.id===characterId);
   if(!authorized)throw Error('Il personaggio non è più assegnato al tuo account.');
   let image:string|null=null;
   if(portraitsEnabled)image=await readCharacterPortrait(fetch,campaignId,characterId).catch(()=>null);
   const assets=visualAssetsEnabled?
    await loadAuthorizedPlayerVisualAssets(campaignId).catch(()=>[]):[];
   if(active){setSheet(authorized);setPortrait(image);setVisualAssets(assets);}
  }).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'Autorizzazione personaggio non verificata');});
  return()=>{active=false;};
 },[campaignId,characterId,portraitsEnabled,visualAssetsEnabled]);
 const media=sheet?resolveAuthorizedPlayerMedia(sheet.sheetData,campaignId,visualAssets):null;
 const entity=sheet?({...sheet.sheetData,id:sheet.id,name:sheet.name,
  portraitImageUrl:portrait??undefined,portraitSourceImageUrl:undefined,
  portraitCropArea:null,coverImageUrl:media?.coverImageUrl,
  portraitFrameAssetId:media?.portraitFrameAssetId??null,
  coverFrameAssetId:media?.coverFrameAssetId??null,
  player:'',notes:String(sheet.sheetData.notes??''),
 } as Character):null;
 return <div className="aruba-entity-overlay" data-entity-context="player-assigned-detail">
  <div className="aruba-entity-backdrop" role="presentation" onClick={onClose}/>
  <SlideOverPanel isOpen onClose={onClose} rightOffset="80px" widthClassName="w-full max-w-6xl">
   <div className="aruba-entity-slide-content">
    <div className="aruba-entity-back-column"><button type="button" onClick={onClose}><ArrowLeft size={17}/> Torna ai personaggi</button></div>
    <div className="aruba-entity-detail-main">
     {error?<p role="alert">{error}</p>:!entity?<p role="status">Verifica autorizzazione…</p>:
      <section aria-label={'Scheda di '+sheet.name}>
       <EntityDetailView entityType="character" entity={entity} onUpdate={()=>{}} canEdit={false}
        campaignId={campaignId} accessToken={null} isHSC={true} isDraft={true}
        arubaReadOnlyMedia={true} arubaReadOnlyVisualAssets={visualAssetsEnabled?visualAssets:undefined}
        showOwnerRow={false} showRail={false} activeSection={section}/>
      </section>}
    </div>
   </div>
  </SlideOverPanel>
  {entity&&<div className="aruba-entity-rail" aria-label="Barra contestuale personaggio">
   <EntityDetailRail activeSection={section} onSectionChange={setSection}/>
  </div>}
 </div>;
}
