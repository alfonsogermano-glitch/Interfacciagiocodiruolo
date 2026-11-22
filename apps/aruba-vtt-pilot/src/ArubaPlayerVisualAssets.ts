import {listPlayerVisualAssets} from './client.mjs';
import type {VisualAsset} from './ArubaVisualAssetsStorage';

/** Loads only metadata for assets currently referenced by the player's
 * assigned sheets. Content URLs stay on the authenticated campaign route. */
export async function loadAuthorizedPlayerVisualAssets(campaignId:string):Promise<VisualAsset[]>{
 return listPlayerVisualAssets(fetch,campaignId);
}
