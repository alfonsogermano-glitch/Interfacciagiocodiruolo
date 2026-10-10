import type { CampaignChatParticipant } from '../supabase/privateChatService';

/** La directory autorizzata fornisce nomi/portrait; Presence solo gli id online.
 * Una scheda duplicata dello stesso utente non aggiunge un secondo portrait. */
export function onlineCampaignParticipants(participants: CampaignChatParticipant[], presence: Record<string, unknown>): CampaignChatParticipant[] {
  const onlineIds = new Set<string>();
  for (const values of Object.values(presence)) {
    if (!Array.isArray(values)) continue;
    for (const value of values) {
      if (value && typeof value.profileId === 'string') onlineIds.add(value.profileId);
    }
  }
  return participants.filter((participant) => onlineIds.has(participant.id))
    .sort((a, b) => Number(b.isGm) - Number(a.isGm) || a.name.localeCompare(b.name, 'it') || a.id.localeCompare(b.id));
}
