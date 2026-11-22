const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const runtimes=new Map();

/** In-memory boundary between the original GM workspace and verified transport.
 * The workspace remains the sole map owner; this registry only exposes live
 * getters and its original handler slots for the same campaign tab. */
export function installGmWorkspaceRuntime(campaignId,runtime){
 if(!UUID.test(campaignId)||!runtime||typeof runtime.getCurrentMapContext!=='function'||
  typeof runtime.onTokenAction!=='function'||typeof runtime.onPoiAction!=='function'||
  typeof runtime.onLayerAction!=='function'||runtimes.has(campaignId))
  throw new TypeError('Unique authoritative GM workspace required');
 const record={runtime,closed:false};runtimes.set(campaignId,record);
 return Object.freeze({close(){if(record.closed)return;record.closed=true;if(runtimes.get(campaignId)===record)runtimes.delete(campaignId);}});
}

export function getGmWorkspaceRuntime(campaignId){
 const record=runtimes.get(campaignId);
 return record&&!record.closed?record.runtime:null;
}
