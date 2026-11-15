import {Children,cloneElement,createContext,isValidElement,useContext,useState,type ReactNode,type ReactElement} from 'react';
type TooltipState={visible:boolean;setVisible:(v:boolean)=>void};
const Context=createContext<TooltipState|null>(null);
export function Tooltip({children}:{children:ReactNode}){
 const [visible,setVisible]=useState(false);
 return <span className="aruba-tooltip-root"><Context.Provider value={{visible,setVisible}}>{children}</Context.Provider></span>;
}
export function TooltipTrigger({children,asChild}:{children:ReactNode;asChild?:boolean}){
 const context=useContext(Context);
 if(asChild&&isValidElement(children)){
  const child=Children.only(children) as ReactElement<Record<string,unknown>>;
  return cloneElement(child,{onMouseEnter:()=>context?.setVisible(true),onMouseLeave:()=>context?.setVisible(false),
   onFocus:()=>context?.setVisible(true),onBlur:()=>context?.setVisible(false)});
 }
 return <span onMouseEnter={()=>context?.setVisible(true)} onMouseLeave={()=>context?.setVisible(false)}>{children}</span>;
}
export function TooltipContent({children}:{children:ReactNode}){
 const context=useContext(Context);
 return context?.visible?<span className="aruba-tooltip-bubble" role="tooltip">{children}</span>:null;
}
