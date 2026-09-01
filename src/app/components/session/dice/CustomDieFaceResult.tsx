import { useState } from 'react';
import { NoteIconGlyph } from '../shared/NoteIconGrid';
import type { CustomDieFace } from './diceTypes.ts';
export function CustomDieFaceResult({face,className='h-4 w-4'}:{face:CustomDieFace;className?:string}){const[broken,setBroken]=useState(false);if(face.visual.kind==='icon')return <NoteIconGlyph name={face.visual.iconName} className={className}/>;if(!broken)return <img src={face.visual.publicUrl} alt={face.label??''} onError={()=>setBroken(true)} className={`${className} rounded object-cover`}/>;return <span className="text-[10px] font-bold">{face.label?.slice(0,1)??'?'}</span>}
