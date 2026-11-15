import {useEffect,useState} from 'react';
import {ImageCropCore} from '../../../src/app/components/shared/ImageCropCore';
import {readCharacterPortrait,saveCharacterPortrait,readCharacterPortraitSource,saveCharacterPortraitSource} from './client.mjs';
/** GM-only isolated Aruba transport into the ORIGINAL cropper.
 * Original sources are kept in a separate GM-only store. Shared asset
 * picker and cover editor remain disabled pending their migration. */
export function ArubaGMCharacterPortrait({campaignId,characterId,name,onSaved}:{
 campaignId:string;characterId:string;name:string;onSaved?:(url:string)=>void;
}){
 const [preview,setPreview]=useState<string|null>(null);
 const [source,setSource]=useState<string|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState<string|null>(null);
 useEffect(()=>{
  let alive=true;setLoading(true);setError(null);setSource(null);setPreview(null);
  void Promise.all([
   readCharacterPortrait(fetch,campaignId,characterId),
   readCharacterPortraitSource(fetch,campaignId,characterId),
  ]).then(([img,original])=>{if(alive){setPreview(img);setSource(original);}})
   .catch(e=>{if(alive)setError(e instanceof Error?e.message:'Ritratto non disponibile');})
   .finally(()=>{if(alive)setLoading(false);});
  return()=>{alive=false;};
 },[campaignId,characterId]);
 return <section className="space-y-4" aria-label={'Immagine di '+name}>
  <h3 className="text-lg font-semibold">Ritratto di {name}</h3>
  <p className="muted">Ritaglio con l'editor originale Hollowgate. Su Aruba vengono conservati sia il JPEG ritagliato (massimo 512 KB), sia la sorgente ridimensionata (massimo 2 MB), accessibile soltanto al GM. Le cornici condivise saranno migrate separatamente.</p>
  {loading?<p role="status">Caricamento ritratto Aruba…</p>:<>
   {error&&<p role="alert" className="error">{error}</p>}
   <ImageCropCore bucket="aruba-portraits" storagePath={characterId+'.jpg'}
    uploadLabel={'Seleziona il ritratto di '+name}
    existingImageUrl={source??preview??undefined} cropShape="rect" aspect={1}
    preserveSource
    uploadSource={blob=>saveCharacterPortraitSource(fetch,campaignId,characterId,blob)}
    uploadCropped={blob=>saveCharacterPortrait(fetch,campaignId,characterId,blob)}
    onUploaded={(url,extra)=>{setPreview(url);if(extra?.sourceUrl)setSource(extra.sourceUrl);
     setError(null);onSaved?.(url);}}/>
  </>}
 </section>;
}
