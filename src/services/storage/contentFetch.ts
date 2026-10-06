import { CONTENT_TABLES, persistenceOwner, selectedContentMode } from './persistenceMode';
import { localRest, localContentRpc } from './localRest';
import { localCampaignApi } from './localCampaignApi';

const LOCAL_RPCS = new Set(['create_dice_formula_folder', 'move_dice_library_node', 'delete_dice_formula_folder', 'set_entity_note_title_icon']);

/** Explicit transport, not a global fetch monkey-patch. Account APIs stay online. */
export async function contentFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = new Request(input, init);
  const owner = persistenceOwner(); // Capture target before any await.
  if (selectedContentMode() !== 'local') return globalThis.fetch(request);
  const url = new URL(request.url);
  const rest = url.pathname.split('/rest/v1/')[1];
  if (rest?.startsWith('rpc/') && LOCAL_RPCS.has(rest.slice(4))) return localContentRpc(rest.slice(4), await request.json(), owner);
  if (rest && CONTENT_TABLES.has(rest)) return localRest(request, owner);
  const api = url.pathname.split('/make-server-771c5bfd/')[1];
  if (api && /^(campaigns|characters|notes|folders)(\/|$)/.test(api)) return localCampaignApi(request, owner);
  return globalThis.fetch(request);
}
