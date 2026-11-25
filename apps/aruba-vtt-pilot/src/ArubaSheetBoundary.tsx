import {Component,type ReactNode} from 'react';

/** Quarantines a malformed historical sheet, never the rest of the VTT.
 * Does not fill in invented game values or perform writes/deletions. */
export class ArubaSheetBoundary extends Component<{children:ReactNode;label?:'Scheda'|'Campagna'},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){
  return this.state.failed?
   <p role="alert" className="error">{this.props.label??'Scheda'} incompleta o incompatibile: apertura sospesa per evitare errori. Nessun dato è stato eliminato; puoi selezionare un altro contenuto.</p>:
   this.props.children;
 }
}
