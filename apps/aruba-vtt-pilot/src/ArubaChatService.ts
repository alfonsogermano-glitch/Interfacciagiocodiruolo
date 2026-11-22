import type {ChatAttachment,ChatMessage,ChatQuote,ChatReaction} from '../../../src/services/supabase/chatService';
import type {RollResult} from '../../../src/app/components/session/dice/diceTypes';
import {rewriteArubaLegacyMedia} from './ArubaLegacyMedia.mjs';

const request=async(path:string,init:RequestInit={})=>{const response=await fetch(path,{credentials:'same-origin',cache:'no-store',redirect:'error',...init,headers:{accept:'application/json',...(init.body?{'content-type':'application/json'}:{}),...init.headers}});const data=await response.json();if(!response.ok)throw new Error(data.error??'Chat non disponibile');return data;};
const base=(campaignId:string)=>`/vtt/campaigns/${campaignId}/chat`;
export async function loadChatMessages(campaignId:string):Promise<ChatMessage[]>{return rewriteArubaLegacyMedia((await request(base(campaignId))).messages) as ChatMessage[];}
export async function sendChatMessage(input:{campaignId:string;senderId:string;senderName:string;senderAvatarUrl?:string;content:string;quote?:ChatQuote}):Promise<ChatMessage|null>{return (await request(base(input.campaignId),{method:'POST',body:JSON.stringify({kind:'message',content:input.content,quote:input.quote})})).message;}
export async function sendChatAttachment(input:{campaignId:string;senderId:string;senderName:string;senderAvatarUrl?:string;attachment:ChatAttachment}):Promise<ChatMessage|null>{return (await request(base(input.campaignId),{method:'POST',body:JSON.stringify({kind:'attachment',attachment:input.attachment})})).message;}
export async function toggleChatReaction(messageId:string,input:{char:string;userId:string;userName:string}):Promise<ChatReaction[]|null>{const campaignId=sessionStorage.getItem('hollowgate.aruba.chat-campaign');if(!campaignId)return null;return (await request(`${base(campaignId)}/${messageId}/reaction`,{method:'PUT',body:JSON.stringify({char:input.char})})).reactions;}
export async function saveRollEntry(roll:RollResult):Promise<string|null>{const message=(await request(base(roll.campaignId),{method:'POST',body:JSON.stringify({id:roll.id,kind:'roll',content:roll.formulaText||roll.formulaName||'Tiro',roll})})).message;return message?.createdAt??null;}
export async function deleteChatMessage(messageId:string):Promise<void>{const campaignId=sessionStorage.getItem('hollowgate.aruba.chat-campaign');if(campaignId)await request(`${base(campaignId)}/${messageId}`,{method:'DELETE'});}
export async function clearChatMessages(campaignId:string):Promise<void>{await request(base(campaignId),{method:'DELETE'});}
const seen=(campaignId:string)=>`hollowgate.chat.last-seen:${campaignId}`;
export function readChatLastSeen(campaignId:string){try{return localStorage.getItem(seen(campaignId));}catch{return null;}}
export function writeChatLastSeen(campaignId:string,createdAt:string){try{localStorage.setItem(seen(campaignId),createdAt);}catch{}}
export async function loadLatestChatAt(campaignId:string){const rows=await loadChatMessages(campaignId);return rows.at(-1)?.createdAt??null;}
export function setArubaChatCampaign(campaignId:string){sessionStorage.setItem('hollowgate.aruba.chat-campaign',campaignId);}
export type {ChatAttachment,ChatMessage,ChatQuote,ChatReaction};
