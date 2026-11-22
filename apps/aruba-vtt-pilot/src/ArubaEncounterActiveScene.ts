import {useActiveScene as useArubaActiveScene} from './ArubaSessionActiveScene';

/** This boundary is mounted only for the authenticated campaign owner. */
export function useActiveScene(campaignId:string|null|undefined){
 return useArubaActiveScene(campaignId,{owner:true});
}
