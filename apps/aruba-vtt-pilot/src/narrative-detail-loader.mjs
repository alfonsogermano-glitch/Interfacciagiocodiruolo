import {listArubaChapters,listArubaNarrativeContent} from './client.mjs';

/** Chapter placement is ancillary to an independently authorized sheet.
 * An invalid chapter collection must not turn a PNG/Monster read into a crash.
 * Session expiration still revokes the entire view. */
export async function loadNarrativeDetail(fetchImpl,campaignId,kind,entityId){
 const [entityResult,chapterResult]=await Promise.allSettled([
  listArubaNarrativeContent(fetchImpl,campaignId,kind),
  listArubaChapters(fetchImpl,campaignId),
 ]);
 if(entityResult.status==='rejected')throw entityResult.reason;
 if(chapterResult.status==='rejected'&&
    String(chapterResult.reason?.message).startsWith('Sessione scaduta:'))
  throw chapterResult.reason;
 const item=entityResult.value.find(candidate=>candidate.id===entityId);
 if(!item)throw Error('Contenuto non trovato o non autorizzato');
 if(item.recoveredPlaceholder===true)
  throw Error('Segnaposto tecnico di recupero: la scheda originale non è presente. Il record è in attesa di pulizia, non viene aperto come una scheda valida.');
 return {
  item,
  chapters:chapterResult.status==='fulfilled'?chapterResult.value:[],
  placementAvailable:chapterResult.status==='fulfilled',
  chapterWarning:chapterResult.status==='rejected'
   ?'Capitoli non disponibili o non validi: la scheda resta consultabile, ma i collegamenti ai capitoli non sono modificabili.'
   :null,
 };
}
