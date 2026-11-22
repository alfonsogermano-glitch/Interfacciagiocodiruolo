import {createContext,useContext,useMemo,useState} from 'react';
import type {Campaign} from '../../../../src/app/campaigns/campaignTypes';

const fixture:Campaign={id:'f24f6bdd-a5f7-4521-aa16-bc0854dc5841',ownerId:'4a3465ec-47d7-4021-9f0d-e70da8cbd001',name:'Campagna browser',description:'QA visuale controllato',ruleset:'hsc',inviteCode:'FIXTURE',createdAt:'2026-11-15T12:00:00.000Z',updatedAt:'2026-11-15T12:00:00.000Z'};
const unavailable=async()=>{throw new Error('Mutation disabled in visual fixture');};
const Context=createContext<any>(null);
export function CampaignProvider({children}:{children:React.ReactNode}){const [active,setActive]=useState(fixture);const value=useMemo(()=>({campaigns:[fixture],joinedCampaigns:[],activeCampaign:active,activeCampaignId:active.id,selectedCampaignId:active.id,isLoading:false,setActiveCampaign:setActive,createCampaign:unavailable,updateCampaign:async()=>{},getCampaignEntityCounts:async()=>({characters:1,npcs:0,monsters:0}),deleteCampaign:unavailable,refreshCampaigns:async()=>{},refreshJoinedCampaigns:async()=>[],joinCampaignByCode:unavailable,previewInviteCode:unavailable,generateInviteCode:async()=>{},inviteByName:async()=>{}}),[active]);return <Context.Provider value={value}>{children}</Context.Provider>;}
export function CampaignScopeOverride({children}:{campaign:Campaign;children:React.ReactNode}){return <>{children}</>;}
export function useCampaign(){const value=useContext(Context);if(!value)throw new Error('Missing fixture CampaignProvider');return value;}
