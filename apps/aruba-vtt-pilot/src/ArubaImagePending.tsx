/** Explicitly disabled on Aruba: the legacy cropper writes to Supabase Storage.
 * Never load its Supabase-dependent module or promise that an image was saved. */
export function ImageCropUploadModal({onClose,uploadLabel}:{onClose:()=>void;uploadLabel?:string}){
 return <div className="aruba-image-pending" role="dialog" aria-modal="true" aria-label={uploadLabel??'Immagine'}>
   <section><h2>Immagini ancora da migrare</h2>
   <p>Il caricamento di ritratti e copertine sarà abilitato dopo l'integrazione dello storage Aruba.
   Le altre parti della scheda possono essere salvate regolarmente.</p>
   <button type="button" onClick={onClose}>Torna alla scheda</button></section>
 </div>;
}
