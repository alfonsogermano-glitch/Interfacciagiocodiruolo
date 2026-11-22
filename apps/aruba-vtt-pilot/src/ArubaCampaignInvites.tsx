import {useState,type FormEvent} from 'react';
import {Check,Copy,KeyRound,Loader2,X} from 'lucide-react';
import {joinCampaignInvite,previewCampaignInvite,rotateCampaignInvite} from './client.mjs';

type Campaign={id:string;ownerId:string;name:string;description:string;ruleset:string;createdAt:string;logoUrl?:string|null;coverImageUrl?:string|null};
const fetcher=fetch.bind(window);

export function ArubaOwnerInviteDialog({campaign,userId,onClose}:{campaign:Campaign;userId:string;onClose:()=>void}){
 const [invite,setInvite]=useState<{code:string;expiresAt:string}|null>(null);
 const [pending,setPending]=useState(false);
 const [copied,setCopied]=useState(false);
 const [error,setError]=useState<string|null>(null);
 async function rotate(){
  if(pending)return;setPending(true);setError(null);setCopied(false);
  try{const value=await rotateCampaignInvite(fetcher,campaign.id,userId);setInvite(value);}
  catch(reason){setInvite(null);setError(reason instanceof Error?reason.message:'Impossibile generare il codice invito');}
  finally{setPending(false);}
 }
 async function copy(){
  if(!invite)return;
  try{await navigator.clipboard.writeText(invite.code);setCopied(true);}
  catch{setError('Copia non disponibile: seleziona manualmente il codice.');}
 }
 return <div className="modal-backdrop" role="presentation" onClick={onClose}>
  <div className="modal" role="dialog" aria-modal="true" aria-label="Invita giocatori" onClick={event=>event.stopPropagation()}>
   <div className="flex items-center justify-between gap-4"><div><div className="overline">INVITO CAMPAGNA</div><h2>Invita giocatori</h2></div>
    <button type="button" className="secondary" aria-label="Chiudi invito" onClick={onClose}><X className="h-4 w-4"/></button></div>
   <p className="muted">{campaign.name}</p>
   {!invite?<p className="footnote">Genera un nuovo codice valido per sette giorni. Un codice precedente verrà revocato.</p>:
    <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-input)] p-4">
     <div className="overline">CODICE MOSTRATO UNA SOLA VOLTA</div>
     <div className="mt-2 flex items-center gap-2"><code className="min-w-0 flex-1 select-all break-all text-base tracking-[0.12em] text-[var(--dash-text-strong)]">{invite.code}</code>
      <button type="button" className="secondary" onClick={()=>void copy()} aria-label="Copia codice invito">{copied?<Check className="h-4 w-4"/>:<Copy className="h-4 w-4"/>}</button></div>
     <p className="footnote">Scade il {new Date(invite.expiresAt).toLocaleString('it-IT')}.</p>
    </div>}
   {error&&<p className="error" role="alert">{error}</p>}
   <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Chiudi</button>
    <button type="button" disabled={pending} onClick={()=>void rotate()}>{pending?<Loader2 className="h-4 w-4 animate-spin"/>:<KeyRound className="h-4 w-4"/>}{invite?'Ruota codice':'Genera codice invito'}</button></div>
  </div>
 </div>;
}

export function ArubaJoinInviteDialog({userId,onJoined,onClose}:{userId:string;onJoined:(campaign:Campaign)=>void;onClose:()=>void}){
 const [code,setCode]=useState('');
 const [preview,setPreview]=useState<Campaign|null>(null);
 const [pending,setPending]=useState(false);
 const [error,setError]=useState<string|null>(null);
 async function inspect(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(pending)return;setPending(true);setError(null);setPreview(null);
  try{setPreview(await previewCampaignInvite(fetcher,code,userId));}
  catch(reason){setError(reason instanceof Error?reason.message:'Impossibile verificare il codice invito');}
  finally{setPending(false);}
 }
 async function join(){
  if(pending||!preview)return;setPending(true);setError(null);
  try{const joined=await joinCampaignInvite(fetcher,code,userId);if(joined.id!==preview.id)throw new Error('Campagna invito non corrispondente');onJoined(joined);}
  catch(reason){setError(reason instanceof Error?reason.message:'Impossibile unirsi alla campagna');}
  finally{setPending(false);}
 }
 return <div className="modal-backdrop" role="presentation" onClick={onClose}>
  <div className="modal" role="dialog" aria-modal="true" aria-label="Unisciti a una campagna" onClick={event=>event.stopPropagation()}>
   <div className="flex items-center justify-between gap-4"><div><div className="overline">CODICE INVITO</div><h2>Unisciti a una campagna</h2></div>
    <button type="button" className="secondary" aria-label="Chiudi adesione" onClick={onClose}><X className="h-4 w-4"/></button></div>
   {!preview?<form onSubmit={event=>void inspect(event)}>
    <label>Codice invito<input value={code} onChange={event=>setCode(event.target.value.toUpperCase())} autoFocus maxLength={23} placeholder="HG-0123456789ABCDEF0123" autoComplete="off" spellCheck={false}/></label>
    {error&&<p className="error" role="alert">{error}</p>}
    <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Annulla</button><button type="submit" disabled={pending||!code.trim()}>{pending&&<Loader2 className="h-4 w-4 animate-spin"/>}Continua</button></div>
   </form>:<div>
    <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-input)] p-4"><div className="overline">CAMPAGNA TROVATA</div><h3 className="mt-2 text-lg text-[var(--dash-text-strong)]">{preview.name}</h3><p className="muted">{preview.description||'Nessuna descrizione'}</p></div>
    <p className="footnote">L’adesione non assegna automaticamente alcun personaggio.</p>
    {error&&<p className="error" role="alert">{error}</p>}
    <div className="modal-actions"><button type="button" className="secondary" disabled={pending} onClick={()=>{setPreview(null);setError(null);}}>Indietro</button><button type="button" disabled={pending} onClick={()=>void join()}>{pending&&<Loader2 className="h-4 w-4 animate-spin"/>}Unisciti</button></div>
   </div>}
  </div>
 </div>;
}
