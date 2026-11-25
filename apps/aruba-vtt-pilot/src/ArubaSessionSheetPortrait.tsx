import {useEffect,useState} from 'react';
import {DraggablePortrait} from '../../../src/app/components/session/shared/DraggablePortrait';
import type {CropAreaPercent} from '../../../src/app/components/shared/SourceCroppedImage';
import {readCharacterPortrait} from './client.mjs';

export type SheetPortraitFields={
 portraitImageUrl?:string;portraitSourceImageUrl?:string|null;portraitCropArea?:CropAreaPercent|null;
};
export function ArubaSessionSheetPortrait({campaignId,characterId,name,enabled=true,...image}:SheetPortraitFields&{
 campaignId:string;characterId?:string;name:string;enabled?:boolean;
}){
 const [portrait,setPortrait]=useState<string|null>(null);
 useEffect(()=>{
  let active=true;setPortrait(null);
  if(!enabled||!characterId)return;
  void readCharacterPortrait(fetch,campaignId,characterId)
   .then(value=>{if(active)setPortrait(value);})
   .catch(()=>{if(active)setPortrait(null);});
  return()=>{active=false;};
 },[campaignId,characterId,enabled]);
 return <DraggablePortrait size={36} chrome="flush" name={name}
  url={characterId?portrait??undefined:image.portraitImageUrl}
  sourceImageUrl={characterId?undefined:image.portraitSourceImageUrl}
  cropArea={characterId?undefined:image.portraitCropArea}
  fallbackIcon={<img src="/vtt/icon-source-1024.png" alt="" draggable={false}
   className="h-full w-full object-contain" style={{filter:'invert(1)',opacity:.9}}/>}/>;
}
