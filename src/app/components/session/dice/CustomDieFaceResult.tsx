import { useState } from 'react';
import { NoteIconGlyph } from '../shared/NoteIconGrid';
import type { CustomDieFace } from './diceTypes.ts';
export function CustomDieFaceResult({face,className='h-4 w-4',symbolColor}:{face:CustomDieFace;className?:string;symbolColor?:string}){const[broken,setBroken]=useState(false);if(face.visual.kind==='icon')return <NoteIconGlyph data-custom-die-face-result name={face.visual.iconName} className={className} style={{color:symbolColor}}/>;if(!broken)return <img data-custom-die-face-result src={face.visual.publicUrl} alt={face.label??''} onError={()=>setBroken(true)} className={`${className} rounded object-contain`}/>;return <span data-custom-die-face-result className="text-[10px] font-bold">{face.label?.slice(0,1)??'?'}</span>}
