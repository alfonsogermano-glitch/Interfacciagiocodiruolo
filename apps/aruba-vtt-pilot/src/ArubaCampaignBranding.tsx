import {ImageCropUploadModal} from '../../../src/app/components/shared/ImageCropUploadModal';
import {ImageSun} from '../../../src/app/components/IconeImmagine';
import {Tooltip,TooltipContent,TooltipTrigger} from '../../../src/app/components/ui/tooltip';
import {visualAssetsStorage,type VisualAsset} from './ArubaVisualAssetsStorage';
import {setCampaignBranding} from './client.mjs';
import {imageBlobToPngDataUrl} from './ArubaImageEncoding';

const UPLOAD_TYPES=new Set(['image/png','image/jpeg','image/webp','image/gif']);
const MAX_UPLOAD=6*1024*1024;
const LOGO_ASPECT=1;
const COVER_ASPECT=3.8;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTENT_URL=/^\/vtt\/campaigns\/([0-9a-f-]{36})\/visual-assets\/([0-9a-f-]{36})\/content$/i;

function assetIdFromUrl(url:string|null){
 if(!url)return null;
 const match=CONTENT_URL.exec(url);
 return match?match[2]:null;
}

function fetchImpl():typeof fetch{return fetch.bind(window)}

/** Original crop/upload UI with the Aruba transport only. The cropped binary
 * is persisted as a campaign visual asset and immediately referenced by the
 * campaign row through the owner-only branding routine. No Supabase path is
 * reachable here; no mock state is used. */
export function ArubaCampaignBrandingDialog({campaignId,campaignName,kind,ownerId,existingImageUrl,otherImageUrl,onUpdated,onClose}:{
 campaignId:string;campaignName:string;kind:'logo'|'cover';ownerId:string;
 existingImageUrl:string|null;otherImageUrl:string|null;
 onUpdated:(campaign:{id:string;ownerId:string;name:string;description:string;ruleset:string;createdAt:string;updatedAt?:string;logoUrl?:string|null;coverImageUrl?:string|null})=>void;
 onClose:()=>void;
}){
 const isLogo=kind==='logo';
 const keptId=assetIdFromUrl(otherImageUrl);
 const uploadLabel=`Seleziona l'immagine di ${isLogo?'Logo Campagna':'Copertina della campagna'}`;
 const uploadCropped=async(blob:Blob)=>{
  if(!UPLOAD_TYPES.has(blob.type))throw new Error('Formato immagine non valido');
  if(blob.size>MAX_UPLOAD)throw new Error('Immagine troppo grande (massimo 6 MB)');
  const asset:VisualAsset={
   id:crypto.randomUUID(),campaignId,
   name:(isLogo?'Logo di ':'Copertina di ')+campaignName,
   type:'other',imageDataUrl:await imageBlobToPngDataUrl(blob,isLogo?1024:1600),
   thumbnailDataUrl:await imageBlobToPngDataUrl(blob,256),createdAt:new Date().toISOString(),
  };
  const saved=await visualAssetsStorage.upsert(asset);
  const branding={logoAssetId:isLogo?saved.id:keptId,
   coverAssetId:isLogo?keptId:saved.id};
  const campaign=await setCampaignBranding(fetchImpl,campaignId,branding,ownerId);
  onUpdated(campaign);
  onClose();
  return {publicUrl:saved.imageDataUrl};
 };
 const onRemove=async()=>{
  try{
   const campaign=await setCampaignBranding(fetchImpl,campaignId,
    {logoAssetId:isLogo?null:keptId,coverAssetId:isLogo?keptId:null},ownerId);
   onUpdated(campaign);
  }finally{onClose();}
 };
 return <ImageCropUploadModal bucket="aruba-campaign-branding"
  storagePath={campaignId+'/'+(isLogo?'logo.jpg':'cover.jpg')}
  cropShape="rect" aspect={isLogo?LOGO_ASPECT:COVER_ASPECT} uploadLabel={uploadLabel}
  existingImageUrl={existingImageUrl??undefined}
  onUploaded={async()=>{}}
  uploadCropped={uploadCropped}
  onRemove={onRemove}
  onClose={onClose}
  />;
}

/** Small toolbar button that opens the branding dialog. Kept separate from
 * the presentation so the original geometry stays untouched. */
export function ArubaCampaignBrandingButton({kind,onClick,title,Icon}:{kind:'logo'|'cover';onClick:()=>void;title:string;Icon:unknown}){
 return <Tooltip>
  <TooltipTrigger asChild>
   <button type="button" aria-label={title} onClick={onClick}
    className="absolute right-3 top-3 z-30 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--dash-border-soft)] bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70">
    <Icon className="h-[22px] w-[22px]" />
   </button>
  </TooltipTrigger>
  <TooltipContent>Come modificare l'immagine {kind==='logo'?'del logo':'della copertina'}</TooltipContent>
 </Tooltip>;
}
