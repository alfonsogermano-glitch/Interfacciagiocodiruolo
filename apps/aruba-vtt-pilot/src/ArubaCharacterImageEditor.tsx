import {useEffect,useRef,useState} from 'react';
import {EntityImageExtras} from '../../../src/app/components/session/shared/EntityImageExtras';
import type {Character} from '../../../src/types/character';
import {ArubaGMCharacterPortrait} from './ArubaGMCharacterPortrait';
import {visualAssetsStorage,type VisualAsset} from './ArubaVisualAssetsStorage';
import {imageBlobToPngDataUrl} from './ArubaImageEncoding';

type ImageEntity=Character & {player:string;notes:string};
const MAX_UPLOAD=6*1024*1024;
const COVER_TYPES=new Set(['image/png','image/jpeg','image/webp','image/gif']);
const DATA_IMAGE=/^data:image\/[a-z0-9.+-]+;base64,/i;

/** Copy a client image into a bounded PNG data URL. The Aruba API stores
 * source and thumbnail separately and enforces its own hard limits. */
function pngDataUrl(file:Blob,size:number):Promise<string>{
 return imageBlobToPngDataUrl(file,size);
}

/** Original EntityImageExtras (frame selectors, portrait frame, cover frame)
 * mounted unchanged. The only substitution is the cover file transport: the
 * original base64 fallback is intercepted BEFORE it reaches the character
 * sheet and persisted as an Aruba visual asset, then referenced by its
 * authenticated content URL. A short debounce keeps manual URL typing from
 * triggering an upload per keystroke. */
export function ArubaCharacterImageEditor({entity,campaignId,characterId,name,portraitsEnabled,onUpdate,onPortraitSaved}:{
 entity:ImageEntity;campaignId:string;characterId:string;name:string;portraitsEnabled:boolean;
 onUpdate:(entity:ImageEntity)=>void;onPortraitSaved:(url:string)=>void;
}){
 const [pending,setPending]=useState<ImageEntity|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState<string|null>(null);
 const pendingRef=useRef<ImageEntity|null>(null);
 pendingRef.current=pending;
 const visible=pending??entity;
 function update(next:ImageEntity){
  const cover=next.coverImageUrl??'';
  if(!DATA_IMAGE.test(cover)){setPending(null);setError(null);onUpdate(next);return;}
  setError(null);setPending(next);
 }
 useEffect(()=>{
  if(!pending||busy)return;
  const timer=setTimeout(()=>{
   const value=pendingRef.current;
   if(!value)return;
   const cover=value.coverImageUrl??'';
   if(!DATA_IMAGE.test(cover)){setPending(null);return;}
   setBusy(true);setError(null);
   void (async()=>{
    try{
     const blob=await (await fetch(cover)).blob();
     if(!COVER_TYPES.has(blob.type))throw new Error('Formato immagine non valido');
     if(blob.size>MAX_UPLOAD)throw new Error('Immagine troppo grande (massimo 6 MB)');
     const asset:VisualAsset={
      id:crypto.randomUUID(),campaignId,
      name:('Copertina di '+name).trim().slice(0,200),
      type:'other',
      imageDataUrl:await pngDataUrl(blob,1600),
      thumbnailDataUrl:await pngDataUrl(blob,256),
      createdAt:new Date().toISOString(),
     };
     const saved=await visualAssetsStorage.upsert(asset);
     onUpdate({...value,coverImageUrl:saved.imageDataUrl});
     setPending(null);
    }catch(reason){
     setPending(null);
     setError(reason instanceof Error?reason.message:'Immagine di copertina non salvata');
    }finally{setBusy(false);}
   })();
  },350);
  return()=>clearTimeout(timer);
 },[pending,busy,campaignId,name,onUpdate]);
 return <section className="space-y-4" aria-label={'Immagini di '+name}>
  {error&&<p role="alert" className="error">{error}</p>}
  {busy&&<p role="status">Caricamento immagine di copertina…</p>}
  <fieldset disabled={busy} className={busy?'opacity-90':''}>
   <EntityImageExtras entity={visible} campaignId={campaignId} entityType="character"
    storageBucket="aruba-portraits" onUpdate={next=>update(next as ImageEntity)}/>
  </fieldset>
  {portraitsEnabled?<ArubaGMCharacterPortrait campaignId={campaignId} characterId={characterId} name={name} onSaved={onPortraitSaved}/>:
   <p className="muted" role="status">Archivio ritratti Aruba non abilitato. Nessuna modifica alle immagini è consentita.</p>}
 </section>;
}
