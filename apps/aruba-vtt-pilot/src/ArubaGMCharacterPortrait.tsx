import {useEffect,useState} from 'react';
import {ImageCropCore} from '../../../src/app/components/shared/ImageCropCore';
import {readCharacterPortrait,saveCharacterPortrait} from './client.mjs';
/** GM-only isolated Aruba transport into the ORIGINAL cropper.
 * Source originals, asset picker and cover editor are deliberately not
 * mounted until they have dedicated Aruba persistence. */
export function ArubaGMCharacterPortrait({campaignId,characterId,name,onSaved}:{
 campaignId:string;characterId:string;name:string;onSaved?:(url:string)=>void;
}){
 const [preview,setPreview]=useState<string|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState<string|null>(null);
 useEffect(()=>{
  let alive=true;setLoading(true);setError(null);
  void readCharacterPortrait(fetch,campaignId,characterId)
   .then(img=>{if(alive)setPreview(img);})
   .catch(e=>{if(alive)setError(e instanceof Error?e.message:'Ritratto non disponibile');})
   .finally(()=>{if(alive)setLoading(false);});
  return()=>{alive=false;};
 },[campaignId,characterId]);
 return <section className="space-y-4" aria-label={'Immagine di '+name}>
  <h3 className="text-lg font-semibold">Ritratto di {name}</h3>
  <p className="muted">Ritaglio con l'editor originale Hollowgate. Su Aruba viene salvato il JPEG ritagliato (massimo 512 KB). La sorgente integrale e le cornici condivise saranno migrate separatamente.</p>
  {loading?<p role="status">Caricamento ritratto Aruba…</p>:<>
   {error&&<p role="alert" className="error">{error}</p>}
   <ImageCropCore bucket="aruba-portraits" storagePath={characterId+'.jpg'}
    uploadLabel={'Seleziona il ritratto di '+name}
    existingImageUrl={preview??undefined} cropShape="rect" aspect={1}
    uploadCropped={blob=>saveCharacterPortrait(fetch,campaignId,characterId,blob)}
    onUploaded={url=>{setPreview(url);setError(null);onSaved?.(url);}}/>
  </>}
 </section>;
}
