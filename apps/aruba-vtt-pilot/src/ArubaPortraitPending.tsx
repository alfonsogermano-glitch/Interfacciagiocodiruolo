import {UserRound} from 'lucide-react';
import type {ReactNode} from 'react';
/** The original EntityCard layout is reused unchanged. Only its
 * Supabase-dependent draggable image/token renderer is deferred. */
export function DraggablePortrait({name,size=140,chrome}:{
 name:string;size?:number;chrome?:string;fallbackIcon?:ReactNode;
}){
 return <div className="aruba-portrait-pending" role="img" aria-label={'Ritratto non disponibile: '+name}
  style={{width:chrome==='flush'?'clamp(84px,28%,140px)':size,
    minWidth:chrome==='flush'?'84px':size,height:chrome==='flush'?'100%':size}}>
   <UserRound size={Math.min(43,size/3)} aria-hidden="true"/>
 </div>;
}
