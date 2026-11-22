import {useRef,useState} from 'react';
import {ImageCropCore} from '../../../src/app/components/shared/ImageCropCore';
import {EntityImageExtras,type EntityImageExtrasEntity} from '../../../src/app/components/session/shared/EntityImageExtras';
import {visualAssetsStorage,type VisualAsset} from './ArubaVisualAssetsStorage';
import {imageBlobToPngDataUrl} from './ArubaImageEncoding';

type Kind='npcs'|'monsters';
type NarrativeImageEntity=EntityImageExtrasEntity&{
 campaignId:string;portraitAssetId?:string|null;portraitSourceImageUrl?:string;
 [key:string]:unknown;
};
const DATA_IMAGE=/^data:image\/[a-z0-9.+-]+;base64,/i;

/** Aruba-only transport around the original cropper and EntityImageExtras.
 * Source, cropped portrait and cover are never retained as inline data in the
 * narrative document: every blob is first persisted as an authenticated,
 * same-campaign visual asset and only its bounded content URL is referenced. */
export function ArubaNarrativeImageEditor({entity,campaignId,kind,onUpdate}:{
 entity:NarrativeImageEntity;campaignId:string;kind:Kind;
 onUpdate:(entity:NarrativeImageEntity)=>void;
}){
 const current=useRef(entity);current.current=entity;
 const pendingSourceUrl=useRef<string|null>(null);
 const [error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false);
 async function store(blob:Blob,label:string,size:number){
  const id=crypto.randomUUID();
  const asset:VisualAsset={id,campaignId,name:(label+' '+entity.name).trim().slice(0,200),type:'other',
   imageDataUrl:await imageBlobToPngDataUrl(blob,size),
   thumbnailDataUrl:await imageBlobToPngDataUrl(blob,256),createdAt:new Date().toISOString()};
  return {id,saved:await visualAssetsStorage.upsert(asset)};
 }
 async function uploadSource(blob:Blob){
  setBusy(true);setError(null);
  try{
   const {saved}=await store(blob,'Sorgente ritratto',1600);
   pendingSourceUrl.current=saved.imageDataUrl;
   onUpdate({...current.current,portraitSourceImageUrl:saved.imageDataUrl});
   return {publicUrl:saved.imageDataUrl};
  }catch(reason){const message=reason instanceof Error?reason.message:'Sorgente ritratto non salvata';setError(message);throw reason;}
  finally{setBusy(false);}
 }
 async function uploadCropped(blob:Blob){
  setBusy(true);setError(null);
  try{
   const {id,saved}=await store(blob,'Ritratto',768);
   onUpdate({...current.current,...(pendingSourceUrl.current?{portraitSourceImageUrl:pendingSourceUrl.current}:{}),
    portraitAssetId:id,portraitImageUrl:saved.imageDataUrl});
   pendingSourceUrl.current=null;
   return {publicUrl:saved.imageDataUrl};
  }catch(reason){const message=reason instanceof Error?reason.message:'Ritratto non salvato';setError(message);throw reason;}
  finally{setBusy(false);}
 }
 function updateExtras(next:NarrativeImageEntity){
  const cover=next.coverImageUrl??'';
  if(!DATA_IMAGE.test(cover)){onUpdate(next);return;}
  setBusy(true);setError(null);
  void (async()=>{
   try{
    const blob=await (await fetch(cover)).blob();
    if(blob.size>6*1024*1024)throw new Error('Immagine troppo grande (massimo 6 MB)');
    const {saved}=await store(blob,'Copertina',1600);
    // The FileReader/asset write is asynchronous: merge against the latest
    // entity so a frame selection made while the cover uploads is not lost.
    onUpdate({...current.current,...next,coverImageUrl:saved.imageDataUrl});
   }catch(reason){setError(reason instanceof Error?reason.message:'Copertina non salvata');}
   finally{setBusy(false);}
  })();
 }
 const type=kind==='npcs'?'npc':'monster';
 return <section className="space-y-6" aria-label={'Immagini di '+entity.name}>
  {error&&<p role="alert" className="error">{error}</p>}
  {busy&&<p role="status">Salvataggio immagine su Aruba…</p>}
  <fieldset disabled={busy} className={busy?'opacity-90':''}>
   <ImageCropCore bucket="aruba-narrative-assets" storagePath={entity.id+'.png'}
    uploadLabel={'Seleziona il ritratto di '+entity.name}
    existingImageUrl={entity.portraitSourceImageUrl??entity.portraitImageUrl}
    cropShape="rect" aspect={1} preserveSource uploadSource={uploadSource}
    uploadCropped={uploadCropped} onUploaded={()=>setError(null)}/>
   <EntityImageExtras entity={entity} campaignId={campaignId} entityType={type}
    storageBucket="aruba-narrative-assets" onUpdate={updateExtras}/>
  </fieldset>
 </section>;
}
