import {useEffect,useState,type ComponentProps} from 'react';
import {EntityCard} from '../../../src/app/components/session/shared/EntityCard';
import {readCharacterPortrait} from './client.mjs';
/** Isolated portrait adapter around the ORIGINAL EntityCard.
 * Never reads legacy sheetData image URLs, never mutates the sheet.
 * The server must validate current GM ownership for every read. */
type OriginalCardProps=ComponentProps<typeof EntityCard>;
export function ArubaPortraitEntityCard({campaignId,characterId,enabled=false,...card}:OriginalCardProps&{
 campaignId:string;characterId:string;enabled?:boolean;
}){
 const [photo,setPhoto]=useState<string|null>(null);
 useEffect(()=>{
  let active=true;
  setPhoto(null);
  if(!enabled)return;
  void readCharacterPortrait(fetch,campaignId,characterId)
   .then(value=>{if(active)setPhoto(value);})
   .catch(()=>{if(active)setPhoto(null);});
  return()=>{active=false;};
 },[campaignId,characterId,enabled]);
 // Don't forward an inherited Supabase photo URL from the backend card props.
 return <EntityCard {...card} photoUrl={photo} photoSourceUrl={null}
  photoCropArea={null}/>;
}
