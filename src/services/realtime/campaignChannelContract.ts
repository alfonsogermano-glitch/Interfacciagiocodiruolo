/**
 * Canonical legacy Hollowgate Realtime event vocabulary.
 *
 * The ORIGINAL Supabase campaignChannel imports this constant directly,
 * so a future Aruba GM-host adapter cannot silently drift from the source
 * protocol. No network or authorization is implemented here.
 * Player permissions MUST be checked by the authenticated relay separately:
 * knowing an event name does NOT authorize sending or receiving it.
 */
export const KNOWN_BROADCAST_EVENTS = [
  'INSERT', 'UPDATE', 'DELETE',
  'session_change', 'active_scene_change', 'active_scene_map_patch',
  'members_change', 'notes_change', 'dice_roll',
  'chat_message', 'chat_reaction', 'chat_delete', 'notification',
  'map_measurement', 'map_token_action', 'map_poi_action',
  'map_object_layer_action', 'map_object_drag_preview',
  'map_cone_direction_preview', 'map_history_action',
  'character_owner_change',
] as const;
export type BroadcastEvent = typeof KNOWN_BROADCAST_EVENTS[number];
const allowed = new Set<string>(KNOWN_BROADCAST_EVENTS);
export function isBroadcastEvent(event: unknown): event is BroadcastEvent {
 return typeof event === 'string' && allowed.has(event);
}
/** Map realtime payload families used by SessionWorkspace/useActiveScene.
 * This describes transport compatibility, NOT map editing authorization. */
export const MAP_BROADCAST_EVENTS = [
 'active_scene_change', 'active_scene_map_patch',
 'map_measurement', 'map_token_action', 'map_poi_action',
 'map_object_layer_action', 'map_object_drag_preview',
 'map_cone_direction_preview', 'map_history_action',
] as const satisfies readonly BroadcastEvent[];
