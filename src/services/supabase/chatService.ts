import { supabase } from '../../lib/supabaseClient';
import type { RollResult } from '../../app/components/session/dice/diceTypes';

export type ChatEntryKind = 'message' | 'roll' | 'attachment';

export interface ChatMessage {
  id: string;
  campaignId: string;
  kind: ChatEntryKind;
  senderId: string;
  senderName: string;
  senderAvatarUrl?: string;
  content: string;
  createdAt: string;
  /** Presente solo per kind='roll': tiro completo serializzato. */
  roll?: RollResult;
}

function rowToEntry(row: any): ChatMessage {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    kind: (row.kind ?? 'message') as ChatEntryKind,
    senderId: row.sender_id,
    senderName: row.sender_name,
    senderAvatarUrl: row.sender_avatar_url ?? undefined,
    content: row.content ?? '',
    createdAt: row.created_at,
    roll: row.kind === 'roll' && row.payload ? (row.payload as RollResult) : undefined,
  };
}

export async function loadChatMessages(campaignId: string): Promise<ChatMessage[]> {
  if (!supabase) {
    console.warn('[chatService] Supabase non configurato');
    return [];
  }
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[chatService] Errore caricamento chat:', error);
    return [];
  }
  console.log(`[chatService] Caricate ${data?.length ?? 0} voci chat per campagna ${campaignId}`);
  return (data ?? []).map(rowToEntry);
}

export async function sendChatMessage(input: {
  campaignId: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl?: string;
  content: string;
}): Promise<ChatMessage | null> {
  if (!supabase) {
    console.warn('[chatService] Supabase non configurato');
    return null;
  }
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      campaign_id: input.campaignId,
      sender_id: input.senderId,
      sender_name: input.senderName,
      sender_avatar_url: input.senderAvatarUrl ?? null,
      kind: 'message',
      content: input.content,
    })
    .select('*')
    .single();
  if (error) {
    console.error('[chatService] Errore invio messaggio chat:', error);
    return null;
  }
  console.log(`[chatService] Messaggio salvato: ${data.id}`);
  return rowToEntry(data);
}

/**
 * Salva un tiro nella timeline della chat. Usa l'id del tiro come chiave e
 * "DO NOTHING" sui conflitti: ogni client che riceve il tiro (in locale o via
 * realtime) può tentare l'insert, ma la riga viene creata una sola volta.
 * I tiri segreti non vengono persistiti.
 * Restituisce il created_at del server della riga (quello già esistente in
 * caso di conflitto), utile per aggiornare il timestamp "visto" della chat.
 */
export async function saveRollEntry(roll: RollResult): Promise<string | null> {
  if (!supabase) return null;
  if (roll.visibility !== 'public') return null;
  const { data, error } = await supabase
    .from('chat_messages')
    .upsert({
      id: roll.id,
      campaign_id: roll.campaignId,
      sender_id: roll.rollerId,
      sender_name: roll.rollerName,
      sender_avatar_url: roll.rollerAvatarUrl ?? null,
      kind: 'roll',
      content: roll.formulaText || roll.formulaName || 'Tiro',
      payload: JSON.parse(JSON.stringify(roll)),
    }, { onConflict: 'id', ignoreDuplicates: true })
    .select('created_at')
    .maybeSingle();
  if (error) {
    console.error('[chatService] Errore salvataggio tiro in chat:', error);
    return null;
  }
  if (data?.created_at) return data.created_at;
  // Conflitto: la riga esiste gia' (inserita da un altro client) - rileggo il
  // suo timestamp dal server per restituire un created_at comunque valido.
  const { data: existing } = await supabase
    .from('chat_messages')
    .select('created_at')
    .eq('id', roll.id)
    .maybeSingle();
  return existing?.created_at ?? null;
}

export async function deleteChatMessage(messageId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('chat_messages').delete().eq('id', messageId);
  if (error) console.error('[chatService] Errore eliminazione voce chat:', error);
}

/**
 * Svuota la chat della campagna. La RLS limita le righe effettivamente
 * cancellate: il GM cancella l'intera timeline, un giocatore i propri messaggi.
 */
export async function clearChatMessages(campaignId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('chat_messages')
    .delete()
    .eq('campaign_id', campaignId);
  if (error) console.error('[chatService] Errore pulizia chat:', error);
}

// ---------------------------------------------------------------
// Pallino "nuova attività" sull'icona Chat della barra destra
// (messaggi di testo e tiri di dado).
// Il timestamp letto/scrivito è sempre un created_at del DB (formato
// ISO del server): il confronto lessicografico è quindi esatto e
// immuno agli sfasamenti di orologio client/server.
// ---------------------------------------------------------------

function chatLastSeenKey(campaignId: string): string {
  return `hollowgate.chat.last-seen.${campaignId}`;
}

export function readChatLastSeen(campaignId: string): string | null {
  try {
    return window.localStorage.getItem(chatLastSeenKey(campaignId));
  } catch {
    return null;
  }
}

export function writeChatLastSeen(campaignId: string, createdAt: string): void {
  try {
    const key = chatLastSeenKey(campaignId);
    // Monotona: non torna mai indietro. Messaggi e tiri si sovrappongono
    // (un tiro rivela mentre un messaggio e' gia' arrivato) e ogni scrittura
    // puo' portare un created_at leggermente vecchio: senza questo guard
    // l'ultimo valore vincente potrebbe essere piu' vecchio dell'ultimo visto
    // e il pallino riapparirebbe al rientro per attivita' gia' lette.
    const current = window.localStorage.getItem(key);
    if (current && current >= createdAt) return;
    window.localStorage.setItem(key, createdAt);
  } catch {
    // Lo storage locale puo' essere bloccato: il pallino degrada in modo grazioso.
  }
}

/**
 * created_at dell'ultima voce di chat della campagna (messaggio o tiro).
 * Se `excludeOwnFrom` e' fornito (id dell'utente corrente), ignora le voci
 * proprie: la propria attivita' non deve accendere il pallino della propria
 * chat al rientro, mentre i messaggi/tiri altrui non letti sì.
 */
export async function loadLatestChatAt(campaignId: string, excludeOwnFrom?: string): Promise<string | null> {
  if (!supabase) return null;
  let query = supabase
    .from('chat_messages')
    .select('created_at')
    .eq('campaign_id', campaignId);
  if (excludeOwnFrom) query = query.neq('sender_id', excludeOwnFrom);
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[chatService] Errore lettura ultima voce chat:', error);
    return null;
  }
  return data?.created_at ?? null;
}
