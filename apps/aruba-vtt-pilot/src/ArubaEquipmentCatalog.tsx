import {useEffect,useMemo,useState,type ChangeEvent,type FormEvent} from 'react';
import {ArchiveBoxIcon,ImageIcon,MagnifyingGlassIcon,PlusIcon,TrashIcon,XIcon} from '@phosphor-icons/react';
import {deleteArubaEquipmentCatalogItem,listArubaEquipmentCatalog,saveArubaEquipmentCatalogItem} from './client.mjs';
import {loadVisualAssetPreviews,VISUAL_ASSETS_CHANGED_EVENT,visualAssetsStorage,type VisualAsset} from './ArubaVisualAssetsStorage';
type Item={id:string;campaignId:string;name:string;description:string;type:'tascabile'|'trasportabile'|'risorsa'|'arma';rarity:'common'|'rare'|'unique'|'story';source:'gm_custom';isVehicle:boolean;isClue:boolean;isStoryItem:boolean;isActive:boolean;isPublic:boolean;tags:string[];linkedEnvironmentIds:string[];linkedNpcIds:string[];linkedMonsterIds:string[];imageAssetId:string|null;iconId:null;iconColor:null;containerItemId:null};
const fresh=(campaignId:string):Item=>({id:crypto.randomUUID(),campaignId,name:'',description:'',type:'risorsa',rarity:'common',source:'gm_custom',isVehicle:false,isClue:false,isStoryItem:false,isActive:true,isPublic:false,tags:[],linkedEnvironmentIds:[],linkedNpcIds:[],linkedMonsterIds:[],imageAssetId:null,iconId:null,iconColor:null,containerItemId:null});
const MAX_UPLOAD=6*1024*1024;
/** Client-side copy scaled into a data URL. The API stores source and
 * thumbnail separately and rejects anything above its own hard limits. */
function imageData(file:File,size:number):Promise<string>{
 return new Promise((resolve,reject)=>{
  const url=URL.createObjectURL(file);
  const image=new Image();
  const done=(callback:()=>void)=>{URL.revokeObjectURL(url);callback();};
  image.onload=()=>done(()=>{
   try{
    const scale=Math.min(1,size/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
    canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    const context=canvas.getContext('2d');
    if(!context)throw new Error('Canvas non disponibile');
    context.drawImage(image,0,0,canvas.width,canvas.height);
    resolve(canvas.toDataURL('image/png'));
   }catch(error){reject(error instanceof Error?error:new Error('Conversione immagine non riuscita'));}
  });
  image.onerror=()=>done(()=>reject(new Error('Immagine non leggibile')));
  image.src=url;
 });
}
export function ArubaEquipmentCatalog({campaignId,enabled,assetsEnabled=false}:{campaignId:string;enabled:boolean;assetsEnabled?:boolean}){
 const [items,setItems]=useState<Item[]>([]),[assets,setAssets]=useState<VisualAsset[]>([]),[selected,setSelected]=useState<Item|null>(null),[query,setQuery]=useState(''),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[assetBusy,setAssetBusy]=useState(false),[error,setError]=useState(''),[assetError,setAssetError]=useState('');
 useEffect(()=>{let active=true;if(!enabled){setLoading(false);return;}setLoading(true);listArubaEquipmentCatalog(fetch.bind(window),campaignId).then(value=>{if(active)setItems(value as Item[]);}).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'Caricamento non riuscito');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[campaignId,enabled]);
 useEffect(()=>{
  if(!enabled||!assetsEnabled)return;
  let active=true;
  const load=()=>{void loadVisualAssetPreviews(campaignId)
   .then(value=>{if(active)setAssets(value.filter(asset=>asset.type==='item-image'));})
   .catch(reason=>{if(active)setAssetError(reason instanceof Error?reason.message:'Asset grafici non disponibili');});};
  load();
  window.addEventListener(VISUAL_ASSETS_CHANGED_EVENT,load);
  return()=>{active=false;window.removeEventListener(VISUAL_ASSETS_CHANGED_EVENT,load);};
 },[campaignId,enabled,assetsEnabled]);
 const visible=useMemo(()=>items.filter(item=>(item.name+' '+item.description+' '+item.tags.join(' ')).toLowerCase().includes(query.trim().toLowerCase())),[items,query]);
 const update=<K extends keyof Item>(key:K,value:Item[K])=>setSelected(item=>item?{...item,[key]:value}:item);
 const imageFor=(id:string|null)=>id?assets.find(asset=>asset.id===id)??null:null;
 const itemImage=selected?imageFor(selected.imageAssetId):null;
 async function save(event:FormEvent){event.preventDefault();if(!selected||!selected.name.trim()||saving)return;setSaving(true);setError('');try{const saved=await saveArubaEquipmentCatalogItem(fetch.bind(window),campaignId,{...selected,name:selected.name.trim()}) as Item;setItems(current=>current.some(item=>item.id===saved.id)?current.map(item=>item.id===saved.id?saved:item):[saved,...current]);setSelected(saved);}catch(reason){setError(reason instanceof Error?reason.message:'Salvataggio non riuscito');}finally{setSaving(false);}}
 async function remove(){if(!selected||saving||!confirm(`Eliminare ${selected.name}?`))return;setSaving(true);try{await deleteArubaEquipmentCatalogItem(fetch.bind(window),campaignId,selected.id);setItems(current=>current.filter(item=>item.id!==selected.id));setSelected(null);}catch(reason){setError(reason instanceof Error?reason.message:'Eliminazione non riuscita');}finally{setSaving(false);}}
 async function uploadImage(event:ChangeEvent<HTMLInputElement>){
  const file=event.target.files?.[0]??null;event.target.value='';
  if(!file||!selected||assetBusy)return;
  setAssetBusy(true);setAssetError('');
  try{
   if(!/^image\/(png|jpeg|webp)$/.test(file.type))throw new Error('Formato immagine non valido');
   if(file.size>MAX_UPLOAD)throw new Error('Immagine troppo grande (massimo 6 MB)');
   const asset:VisualAsset={id:crypto.randomUUID(),campaignId,name:file.name.trim().slice(0,200)||'Immagine oggetto',type:'item-image',imageDataUrl:await imageData(file,1600),thumbnailDataUrl:await imageData(file,256),createdAt:new Date().toISOString()};
   await visualAssetsStorage.upsert(asset);
   setAssets(current=>[asset,...current.filter(value=>value.id!==asset.id)]);
   update('imageAssetId',asset.id);
  }catch(reason){setAssetError(reason instanceof Error?reason.message:'Caricamento immagine non riuscito');}
  finally{setAssetBusy(false);}
 }
 if(!enabled)return <div className="placeholder"><ArchiveBoxIcon size={34} weight="duotone"/><h2>Archivio Oggetti non disponibile</h2><p>Il servizio Aruba è disabilitato e non vengono mostrati dati simulati.</p></div>;
 return <section className="aruba-narrative-manager" aria-label="Archivio Oggetti"><header className="aruba-manager-title"><div><span className="overline">CATALOGO DELLA CAMPAGNA</span><h1><ArchiveBoxIcon weight="duotone"/> Archivio Oggetti</h1><p className="muted">Oggetti personalizzati persistiti nel backend Aruba.</p></div><button type="button" onClick={()=>setSelected(fresh(campaignId))}><PlusIcon/> Nuovo oggetto</button></header>
 {error&&<p role="alert" className="error">{error}</p>}<div className="aruba-manager-layout"><aside><label className="aruba-manager-search"><MagnifyingGlassIcon/><input aria-label="Cerca oggetti" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Cerca..."/></label>{loading?<p className="muted">Caricamento...</p>:visible.length?<ul>{visible.map(item=>{const asset=imageFor(item.imageAssetId);return <li key={item.id}><button type="button" className={selected?.id===item.id?'active':''} onClick={()=>setSelected(item)}><span className="aruba-manager-row">{asset?.thumbnailDataUrl?<img src={asset.thumbnailDataUrl} alt=""/>:<span className="aruba-manager-row-placeholder"><ImageIcon size={16} weight="duotone"/></span>}<span className="aruba-manager-row-text"><strong>{item.name}</strong><span>{item.type} · {item.rarity}</span></span></span></button></li>;})}</ul>:<p className="muted">Nessun oggetto trovato.</p>}</aside>
 <div className="aruba-manager-detail">{selected?<form aria-label="Editor oggetto" onSubmit={save}><div className="aruba-manager-detail-head"><h2>{items.some(item=>item.id===selected.id)?selected.name:'Nuovo oggetto'}</h2><button type="button" className="icon-button" aria-label="Chiudi dettaglio" onClick={()=>setSelected(null)}><XIcon/></button></div><label>Nome<input required maxLength={200} value={selected.name} onChange={event=>update('name',event.target.value)}/></label><div className="aruba-manager-fields"><label>Tipo<select value={selected.type} onChange={event=>update('type',event.target.value as Item['type'])}><option value="tascabile">Tascabile</option><option value="trasportabile">Trasportabile</option><option value="risorsa">Risorsa</option><option value="arma">Arma</option></select></label><label>Rarità<select value={selected.rarity} onChange={event=>update('rarity',event.target.value as Item['rarity'])}><option value="common">Comune</option><option value="rare">Raro</option><option value="unique">Unico</option><option value="story">Storia</option></select></label></div><label>Descrizione<textarea rows={6} maxLength={20000} value={selected.description} onChange={event=>update('description',event.target.value)}/></label><label>Tag<input value={selected.tags.join(', ')} onChange={event=>update('tags',event.target.value.split(',').map(value=>value.trim()).filter(Boolean).slice(0,50))}/></label>
 {assetsEnabled?<div className="aruba-item-image-field"><label>Immagine oggetto<select value={selected.imageAssetId??''} disabled={assetBusy} onChange={event=>update('imageAssetId',event.target.value||null)}><option value="">Nessuna immagine</option>{assets.map(asset=><option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>{itemImage&&<img className="aruba-item-image-preview" src={itemImage.thumbnailDataUrl||itemImage.imageDataUrl} alt={'Immagine di '+selected.name}/>}<div className="aruba-item-image-actions"><input type="file" aria-label="Carica immagine oggetto" accept="image/png,image/jpeg,image/webp" disabled={assetBusy} onChange={event=>void uploadImage(event)}/>{assetBusy&&<span role="status">Caricamento immagine…</span>}</div>{assetError&&<p role="alert" className="error">{assetError}</p>}</div>:<p className="muted">Asset grafici non abilitati: il catalogo non mostra né modifica immagini.</p>}
 <div className="aruba-manager-fields"><label className="check"><input type="checkbox" checked={selected.isClue} onChange={event=>update('isClue',event.target.checked)}/> Indizio</label><label className="check"><input type="checkbox" checked={selected.isStoryItem} onChange={event=>update('isStoryItem',event.target.checked)}/> Oggetto narrativo</label><label className="check"><input type="checkbox" checked={selected.isPublic} onChange={event=>update('isPublic',event.target.checked)}/> Visibile ai giocatori</label><label className="check"><input type="checkbox" checked={selected.isVehicle} onChange={event=>update('isVehicle',event.target.checked)}/> Veicolo</label></div><div className="aruba-manager-actions"><button type="submit" disabled={saving}>{saving?'Salvataggio…':'Salva'}</button>{items.some(item=>item.id===selected.id)&&<button type="button" disabled={saving} onClick={()=>void remove()}><TrashIcon/> Elimina</button>}</div></form>:<p className="muted">Seleziona o crea un oggetto per modificarne i dettagli.</p>}</div></div></section>;
}
