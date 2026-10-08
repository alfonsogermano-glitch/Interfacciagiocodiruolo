import { supabase } from '../../lib/supabaseClient';
import { persistenceKey } from '../storage/persistenceMode';
import type { DiceSkinId, RollCustomDieFace, RollResult } from '../../app/components/session/dice/diceTypes';

export type ChatEntryKind = 'message' | 'roll' | 'attachment';

/** Faccia custom uscita in un tiro, con i colori/skin del dado per poterla
 rigenerare graficamente nella citazione (banner composer + bolle chat). */
export interface ChatQuoteDiceFace {
  face: RollCustomDieFace;
  symbolColor?: string;
  bodyColor?: string;
  skinId?: DiceSkinId;
  textureScale?: number;
  /** Quante volte la stessa faccia e' uscita (raggruppamento "xN"). */
  count: number;
}

/** Citazione di un messaggio/tiro allegato al messaggio che si sta scrivendo. */
export interface ChatQuote {
  senderName: string;
  content: string;
  kind: ChatEntryKind;
  /** Solo per kind='roll' con dadi custom: facce visive da mostrare al
   posto della conversione testuale. */
  diceFaces?: ChatQuoteDiceFace[];
}

/** Reazione emoji lasciata su un messaggio (una per utente per messaggio). */
export interface ChatReaction {
  char: string;
  userId: string;
  userName: string;
  createdAt: string;
}

/** Allegato file condiviso in chat: qui ci sono solo i metadati, i bytes
 stanno nello storage scelto dall'utente al caricamento (Locale = IndexedDB
 via contentAssets, Cloud = bucket Supabase Storage). */
export interface ChatAttachment {
  /** Nome originale completo con estensione (card in chat + nome proposto
   nella finestra "Salva con nome"). */
  fileName: string;
  /** Dimensione in byte (limite massimo 50 MB, validato al caricamento). */
  size: number;
  contentType: string;
  bucket: string;
  /** Path dentro il bucket o id dell'asset locale (`bucket/path`). */
  assetPath: string;
  /** Dove sono finiti i bytes al caricamento: determina come scaricarli. */
  storage: 'local' | 'cloud';
}

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
  /** Citazione persistita in payload.quote (solo per kind='message'). */
  quote?: ChatQuote;
  /** Allegato persistito in payload.attachment (solo per kind='attachment'). */
  attachment?: ChatAttachment;
  /** Reazioni emoji della riga (colonna reactions JSONB). */
  reactions?: ChatReaction[];
}

function rowToEntry(row: any): ChatMessage {
  const payload = row.payload && typeof row.payload === 'object' ? row.payload : null;
  return {
    id: row.id,
    campaignId: row.campaign_id,
    kind: (row.kind ?? 'message') as ChatEntryKind,
    senderId: row.sender_id,
    senderName: row.sender_name,
    senderAvatarUrl: row.sender_avatar_url ?? undefined,
    content: row.content ?? '',
    createdAt: row.created_at,
    roll: row.kind === 'roll' && payload ? (payload as RollResult) : undefined,
    quote: row.kind !== 'roll' && payload && payload.quote ? (payload.quote as ChatQuote) : undefined,
    attachment: row.kind === 'attachment' && payload && payload.attachment
      ? (payload.attachment as ChatAttachment)
      : undefined,
    reactions: Array.isArray(row.reactions) ? (row.reactions as ChatReaction[]) : [],
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
  quote?: ChatQuote;
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
      payload: input.quote ? { quote: input.quote } : undefined,
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
 * Salva un allegato file nella timeline della chat (kind='attachment').
 * Il payload contiene solo i metadati (ChatAttachment): i bytes restano dove
 * ha caricato l'utente - IndexedDB in Locale, bucket Storage in Cloud - e
 * vengono letti di nuovo solo al momento del download.
 * content = fileName, utile per leggere l'elenco anche come testo piano.
 */
export async function sendChatAttachment(input: {
  campaignId: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl?: string;
  attachment: ChatAttachment;
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
      kind: 'attachment',
      content: input.attachment.fileName,
      payload: { attachment: input.attachment },
    })
    .select('*')
    .single();
  if (error) {
    console.error('[chatService] Errore invio allegato chat:', error);
    return null;
  }
  console.log(`[chatService] Allegato salvato: ${data.id}`);
  return rowToEntry(data);
}

/**
 * Toggle della reazione emoji dell'utente su un messaggio (una reazione per
 * utente per messaggio: la stessa emoji la rimuove, una diversa la sostituisce).
 * Read-modify-write sulla colonna reactions: nessuna transazione client-side,
 * le scritture concorrenti di utenti diversi sono comunque tollerabili qui.
 * Ritorna la lista aggiornata o null se la riga non esiste/c'e' stato errore
 * (usato anche per i tiri solo-locali, che nel DB non hanno riga).
 */
export async function toggleChatReaction(
  messageId: string,
  input: { char: string; userId: string; userName: string },
): Promise<ChatReaction[] | null> {
  if (!supabase) return null;
  // .limit(1) invece di .single()/maybeSingle(): in Locale l'Accept a riga
  // singola darebbe 406/PGRST116 sulle righe assenti (localRest).
  const { data: rows, error: readError } = await supabase
    .from('chat_messages')
    .select('reactions')
    .eq('id', messageId)
    .limit(1);
  if (readError) {
    console.error('[chatService] Errore lettura reazioni:', readError);
    return null;
  }
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) {
    console.warn('[chatService] Reazioni ignorate: riga chat inesistente', messageId);
    return null;
  }
  const current: ChatReaction[] = Array.isArray(row.reactions) ? row.reactions : [];
  const mine = current.filter((reaction) => reaction.userId !== input.userId);
  const alreadySame = current.some(
    (reaction) => reaction.userId === input.userId && reaction.char === input.char,
  );
  const next: ChatReaction[] = alreadySame
    ? mine
    : [...mine, {
        char: input.char,
        userId: input.userId,
        userName: input.userName,
        createdAt: new Date().toISOString(),
      }];
  const { data: updated, error } = await supabase
    .from('chat_messages')
    .update({ reactions: next })
    .eq('id', messageId)
    .select('reactions')
    .limit(1);
  if (error) {
    console.error('[chatService] Errore salvataggio reazione:', error);
    return null;
  }
  if (!Array.isArray(updated) || updated.length === 0) {
    console.warn('[chatService] Reazione non salvata: riga non trovata', messageId);
    return null;
  }
  return next;
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
  return persistenceKey(`hollowgate.chat.last-seen.${campaignId}`);
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
 * created_at dell'ultima voce di chat della campagna (messaggio o tiro,
 * incluso i propri: il proprio tiro con chat chiusa deve accendere il
 * pallino al rientro, come la cronica tiri). Null se assente.
 */
export async function loadLatestChatAt(campaignId: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('chat_messages')
    .select('created_at')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[chatService] Errore lettura ultima voce chat:', error);
    return null;
  }
  return data?.created_at ?? null;
}
