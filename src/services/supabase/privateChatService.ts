import { supabase } from '../../lib/supabaseClient';
import { selectedContentMode } from '../storage/persistenceMode';
import type { ChatAttachment, ChatMessage } from './chatService';

export const PRIVATE_CHAT_BUCKET = 'private-chat-attachments';
export const PRIVATE_CHAT_PAGE_SIZE = 50;
export interface PrivateChatCursor { createdAt: string; id: string }

function olderThan(cursor: PrivateChatCursor): string {
  requireId(cursor.id);
  if (!/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(cursor.createdAt)) throw new Error('Data messaggio non valida.');
  return `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`;
}

export interface CampaignChatParticipant {
  id: string;
  name: string;
  avatarUrl?: string;
  isGm: boolean;
}
export interface PrivateChatMessage extends ChatMessage {
  recipientId: string;
  recipientName: string;
  recipientAvatarUrl?: string;
  deletedAt?: string;
}

function cloudClient() {
  if (selectedContentMode() === 'local') throw new Error('I messaggi privati tra utenti richiedono una campagna Cloud.');
  if (!supabase) throw new Error('Supabase non disponibile.');
  return supabase;
}
function requireId(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('Identificativo partecipante non valido.');
}
function databaseError(message: string, code?: string): Error {
  if (code === '42P01' || code === 'PGRST202' || code === 'PGRST205' || /schema cache|does not exist/i.test(message)) {
    return new Error('Chat privata non disponibile: applica la migration Supabase 20261010100000_private_campaign_chat.sql.');
  }
  if (code === '42501') return new Error('Non sei autorizzato a questa conversazione privata.');
  return new Error(message);
}

export function privateChatRow(row: Record<string, any>): PrivateChatMessage {
  return {
    id: row.id, campaignId: row.campaign_id, kind: row.kind,
    senderId: row.sender_id, senderName: row.sender_name,
    senderAvatarUrl: row.sender_avatar_url ?? undefined,
    recipientId: row.recipient_id, recipientName: row.recipient_name,
    recipientAvatarUrl: row.recipient_avatar_url ?? undefined,
    content: row.content ?? '', createdAt: row.created_at,
    attachment: row.kind === 'attachment' ? row.payload?.attachment : undefined,
    deletedAt: row.deleted_at ?? undefined,
  };
}
export function privateChatPeer(message: PrivateChatMessage, userId: string): CampaignChatParticipant {
  return message.senderId === userId
    ? { id: message.recipientId, name: message.recipientName, avatarUrl: message.recipientAvatarUrl, isGm: false }
    : { id: message.senderId, name: message.senderName, avatarUrl: message.senderAvatarUrl, isGm: false };
}
export function belongsToPrivateThread(message: PrivateChatMessage, userId: string, peerId: string): boolean {
  return (message.senderId === userId && message.recipientId === peerId)
    || (message.senderId === peerId && message.recipientId === userId);
}
export function mergePrivateMessages(current: PrivateChatMessage[], incoming: PrivateChatMessage[]): PrivateChatMessage[] {
  const rows = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    // Una risposta di caricamento iniziata prima di una cancellazione non
    // deve riportare in vita un messaggio già cancellato via Realtime.
    if (rows.get(message.id)?.deletedAt && !message.deletedAt) continue;
    rows.set(message.id, message);
  }
  return [...rows.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export async function loadPrivateChatParticipants(campaignId: string): Promise<CampaignChatParticipant[]> {
  const { data, error } = await cloudClient().rpc('private_chat_participants', { p_campaign_id: campaignId });
  if (error) throw databaseError(error.message, error.code);
  return (data ?? []).map((row: any) => ({ id: row.profile_id, name: row.display_name, avatarUrl: row.avatar_url ?? undefined, isGm: row.is_gm }));
}
export async function loadPrivateChatInbox(campaignId: string): Promise<PrivateChatMessage[]> {
  const client = cloudClient();
  const messages: PrivateChatMessage[] = [];
  let cursor: PrivateChatCursor | undefined;
  // Pagine con cursore stabile, senza perdere conversazioni offline vecchie
  // né messaggi con timestamp identico al confine tra due pagine.
  while (true) {
    let query = client.from('private_chat_messages').select('*').eq('campaign_id', campaignId)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(500);
    if (cursor) query = query.or(olderThan(cursor));
    const { data, error } = await query;
    if (error) throw databaseError(error.message, error.code);
    const page = (data ?? []).map(privateChatRow);
    messages.push(...page);
    if (page.length < 500) return messages;
    const last = page[page.length - 1];
    cursor = { createdAt: last.createdAt, id: last.id };
  }
}
export async function loadPrivateChatMessages(campaignId: string, peerId: string, before?: PrivateChatCursor): Promise<PrivateChatMessage[]> {
  requireId(peerId);
  let query = cloudClient().from('private_chat_messages').select('*').eq('campaign_id', campaignId)
    .is('deleted_at', null).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(PRIVATE_CHAT_PAGE_SIZE);
  const pair = `sender_id.eq.${peerId},recipient_id.eq.${peerId}`;
  query = query.or(before ? `and(or(${pair}),or(${olderThan(before)}))` : pair);
  const { data, error } = await query;
  if (error) throw databaseError(error.message, error.code);
  return (data ?? []).map(privateChatRow).reverse();
}
export async function sendPrivateChatMessage(input: { campaignId: string; senderId: string; recipientId: string; content?: string; attachment?: ChatAttachment }): Promise<PrivateChatMessage> {
  requireId(input.recipientId);
  if (input.senderId === input.recipientId) throw new Error('Scegli un altro partecipante.');
  const { data, error } = await cloudClient().from('private_chat_messages').insert({
    campaign_id: input.campaignId, sender_id: input.senderId, recipient_id: input.recipientId,
    kind: input.attachment ? 'attachment' : 'message', content: input.content?.trim() ?? '',
    payload: input.attachment ? { attachment: input.attachment } : null,
  }).select('*').single();
  if (error) throw databaseError(error.message, error.code);
  return privateChatRow(data);
}
export async function deletePrivateChatMessage(messageId: string): Promise<void> {
  const { data, error } = await cloudClient().from('private_chat_messages')
    .update({ deleted_at: new Date().toISOString() }).eq('id', messageId).select('id');
  if (error) throw databaseError(error.message, error.code);
  if (!data?.length) throw new Error('Puoi cancellare soltanto i tuoi messaggi.');
}

/** Nessun broadcast di contenuti sul canale campagna. Postgres Changes
 * consegna INSERT/UPDATE soltanto alle sessioni autorizzate dalla RLS. */
export function subscribePrivateChat(campaignId: string, userId: string, onMessage: (message: PrivateChatMessage) => void, onStatus?: (ready: boolean) => void): () => void {
  if (selectedContentMode() === 'local' || !supabase) return () => {};
  const client = supabase;
  const channel = client.channel(`private-chat-db:${campaignId}:${userId}:${crypto.randomUUID()}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'private_chat_messages', filter: `campaign_id=eq.${campaignId}` }, (event) => {
      const row = privateChatRow(event.new);
      if (row.senderId === userId || row.recipientId === userId) onMessage(row);
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'private_chat_messages', filter: `campaign_id=eq.${campaignId}` }, (event) => {
      const row = privateChatRow(event.new);
      if (row.senderId === userId || row.recipientId === userId) onMessage(row);
    }).subscribe((status) => onStatus?.(status === 'SUBSCRIBED'));
  return () => { void client.removeChannel(channel); };
}
function lastSeenKey(campaignId: string, userId: string, peerId: string) {
  return `hollowgate.private-chat.last-seen:${userId}:${campaignId}:${peerId}`;
}
export function readPrivateChatLastSeen(campaignId: string, userId: string, peerId: string): string | null {
  try { return localStorage.getItem(lastSeenKey(campaignId, userId, peerId)); } catch { return null; }
}
export function markPrivateChatSeen(campaignId: string, userId: string, peerId: string, timestamp: string) {
  try {
    const key = lastSeenKey(campaignId, userId, peerId);
    const current = localStorage.getItem(key);
    if (!current || timestamp > current) localStorage.setItem(key, timestamp);
    window.dispatchEvent(new Event('hollowgate:private-chat-seen'));
  } catch { /* Il rendering resta disponibile con localStorage bloccato. */ }
}
export function isPrivateChatUnread(message: PrivateChatMessage, userId: string): boolean {
  if (message.deletedAt || message.recipientId !== userId) return false;
  const seen = readPrivateChatLastSeen(message.campaignId, userId, message.senderId);
  return !seen || message.createdAt > seen;
}

function threadKey(message: PrivateChatMessage): string {
  return message.senderId < message.recipientId
    ? `${message.senderId}:${message.recipientId}`
    : `${message.recipientId}:${message.senderId}`;
}
/** Ricarica autorevole dell'inbox dopo un caricamento dal server: i fili
 * eliminati con la pulizia della chat privata spariscono anche dallo stato
 * locale, senza rimuovere gli arrivi in tempo reale piu' recenti della
 * richiesta (che il snapshot del server puo' non aver ancora visto). */
export function refreshPrivateInbox(current: PrivateChatMessage[], inbox: PrivateChatMessage[]): PrivateChatMessage[] {
  const threads = new Set(inbox.map(threadKey));
  const recentLimit = new Date(Date.now() - 60_000).toISOString();
  const alive = current.filter((message) => threads.has(threadKey(message)) || message.createdAt > recentLimit);
  return mergePrivateMessages(alive, inbox);
}

/** Elimina definitivamente tutta la conversazione tra senderId e peerId: prima
 * i file caricati dall'utente vengono rimossi fisicamente dallo Storage, poi la
 * funzione security definer elimina i messaggi della coppia e i riferimenti a
 * tutti i file di entrambe le cartelle. Nessun soft-delete: la conversazione
 * sparisce per entrambi i partecipanti. */
export async function clearPrivateChat(campaignId: string, peerId: string, senderId: string): Promise<void> {
  requireId(peerId);
  const client = cloudClient();
  const ownDir = `${campaignId}/${senderId}/${peerId}`;
  const listed = await client.storage.from(PRIVATE_CHAT_BUCKET).list(ownDir, { limit: 1000 });
  if (!listed.error && listed.data?.length) {
    await client.storage.from(PRIVATE_CHAT_BUCKET).remove(listed.data.map((file) => `${ownDir}/${file.name}`));
  }
  const { error } = await client.rpc('clear_private_chat_conversation', {
    p_campaign: campaignId,
    p_peer_a: senderId,
    p_peer_b: peerId,
  });
  if (error) throw databaseError(error.message, error.code);
}
