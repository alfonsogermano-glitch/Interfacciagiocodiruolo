import {useState} from 'react';
import {HouseIcon,UsersThreeIcon,ScrollIcon,GitBranchIcon,PlayIcon,FileTextIcon,GhostIcon,SwordIcon,LightbulbIcon,BookmarkIcon,MapTrifoldIcon,NotebookIcon,DiceFiveIcon,ChatCircleDotsIcon,BooksIcon,ImageIcon} from '@phosphor-icons/react';
import type {IconWeight} from '@phosphor-icons/react';
import './styles.css';

const left=[
  {label:'Panoramica',Icon:HouseIcon},{label:'Personaggi',Icon:UsersThreeIcon},
  {label:'Campagne',Icon:ScrollIcon},
];
const right=[
  {label:'Capitoli e Scene',Icon:GitBranchIcon},{label:'Preparazione',Icon:PlayIcon},
  {label:'Schede',Icon:FileTextIcon},{label:'PNG',Icon:GhostIcon},
  {label:'Mostri',Icon:SwordIcon},{label:'Indizi',Icon:LightbulbIcon},
  {label:'Archivio Oggetti',Icon:BookmarkIcon},
];
const extra=[
  {label:'Mappe',Icon:MapTrifoldIcon},{label:'Note',Icon:NotebookIcon},
  {label:'Dadi',Icon:DiceFiveIcon},{label:'Chat',Icon:ChatCircleDotsIcon},
  {label:'Regole',Icon:BooksIcon},{label:'Asset',Icon:ImageIcon},
];
export default function IconStudy(){
 const [weight,setWeight]=useState<IconWeight>('duotone');
 return <main className="icon-study">
  <div className="study-heading"><div><span className="overline">STUDIO VISIVO · NON APPLICATO</span>
   <h1>Hollowgate · confronto icone</h1><p>Un test di Phosphor: nessun comando o layout del VTT originale viene modificato.</p>
  </div><a href="/vtt/">Torna al VTT</a></div>
  <fieldset className="study-weights"><legend>Stile delle icone</legend>
   {(['duotone','regular','bold','fill'] as IconWeight[]).map(w=>
    <label key={w}><input type="radio" checked={weight===w} onChange={()=>setWeight(w)}/>{w}</label>)}
  </fieldset>
  <div className="study-example">
   <aside className="study-left">
    <span className="study-region">SINISTRA · NAVIGAZIONE UTENTE</span>
    {left.map(({label,Icon})=><div key={label} className="study-item"><Icon size={23} weight={weight}/><span>{label}</span></div>)}
    <div className="study-campaigns"><span>Campagne selezionate</span><div className="study-campaign">La mia campagna</div></div>
   </aside>
   <article className="study-center">
    <span className="overline">AREA CENTRALE · IDENTICA STRUTTURA</span><h2>Panoramica e contenuti</h2>
    <p>La colonna sinistra rimane riservata a panoramica, personaggi e campagne. La colonna destra rimane riservata agli strumenti del Game Master. Questa pagina confronta soltanto il tratto grafico delle icone.</p>
    <h3>Altri simboli disponibili</h3>
    <div className="study-icons">{extra.map(({label,Icon})=><div key={label}><Icon size={28} weight={weight}/><span>{label}</span></div>)}</div>
    <p className="study-warning">Nessuna sostituzione generale verrà eseguita prima del ripristino delle funzioni originali.</p>
   </article>
   <aside className="study-right"><span className="study-region">DESTRA · STRUMENTI GM</span>
    {right.map(({label,Icon})=><div key={label} className="study-item"><Icon size={22} weight={weight}/><span>{label}</span></div>)}
   </aside>
  </div>
 </main>;
}
