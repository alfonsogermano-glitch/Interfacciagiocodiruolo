import type {ComponentType} from 'react';
import {GhostIcon,SwordIcon,BookmarkSimpleIcon,GitBranchIcon,MapTrifoldIcon,LightbulbIcon,ScrollIcon,PlayIcon,ImageIcon,FileTextIcon} from '@phosphor-icons/react';
import {GmSectionSidebar} from '../../../src/app/layout/GmSectionSidebar';

// Keep the original navigation and visual layout; replace only icons in the Aruba build.
const icons:Record<string,ComponentType<{className?:string}>>={
 chapters:GitBranchIcon,'scene-encounter':PlayIcon,players:FileTextIcon,
 npcs:GhostIcon,monsters:SwordIcon,clues:LightbulbIcon,
 'equipment-catalog':BookmarkSimpleIcon,map:MapTrifoldIcon,
 situations:ScrollIcon,phases:PlayIcon,combat:SwordIcon,'visual-assets':ImageIcon,
};

export function ArubaGmSectionSidebar(props:{activeTab:string;onChangeTab:(id:string)=>void}){
 return <GmSectionSidebar {...props} iconOverrides={icons}/>;
}
