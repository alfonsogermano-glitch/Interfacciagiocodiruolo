import {useEffect,useState} from 'react';
import {ImageCropCore} from '../../../src/app/components/shared/ImageCropCore';
import {readCharacterPortrait,saveCharacterPortrait} from './client.mjs';

/** Claimed-player portrait editor. It persists only the bounded cropped image;
 * GM-only original source storage and campaign visual assets remain unavailable. */
export function ArubaClaimedCharacterPortrait({campaignId,characterId,name,onSaved}:{
 campaignId:string;characterId:string;name:string;onSaved?:(url:string)=>void;
}){
 const [preview,setPreview]=useState<string|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState<string|null>(null);
 useEffect(()=>{
  let active=true;setLoading(true);setError(null);setPreview(null);
  void readCharacterPortrait(fetch,campaignId,characterId)
   .then(url=>{if(active)setPreview(url);})
   .catch(()=>{if(active)setPreview(null);})
   .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[campaignId,characterId]);
 return <section className="space-y-4" aria-label={'Ritratto reclamato di '+name}>
  <h3 className="text-lg font-semibold">Ritratto di {name}</h3>
  <p className="muted">Il giocatore può aggiornare soltanto il ritratto ritagliato. Sorgente originale, copertina e asset condivisi restano sotto il controllo del GM.</p>
  {error&&<p role="alert" className="error">{error}</p>}
  {loading?<p role="status">Caricamento ritratto Aruba…</p>:
   <ImageCropCore bucket="aruba-portraits" storagePath={characterId+'.jpg'}
    uploadLabel={'Seleziona il ritratto di '+name} existingImageUrl={preview??undefined}
    cropShape="rect" aspect={1} preserveSource={false}
    uploadCropped={blob=>saveCharacterPortrait(fetch,campaignId,characterId,blob)}
    onUploaded={url=>{setPreview(url);setError(null);onSaved?.(url);}}/>}
 </section>;
}
