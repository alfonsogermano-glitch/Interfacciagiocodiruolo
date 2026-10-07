import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquare, Plus, Smile, Image as ImageIcon, MoreVertical, Trash2, Quote, X } from 'lucide-react';
import { useDiceSession } from './dice/DiceSessionContext';
import { EmojiPicker } from './EmojiPicker';
import { EmojiFlag, FlagText, flagImageName } from './EmojiFlag';
import { DiceRollHistoryCard } from './dice/DiceRollHistoryCard';
import type { RollResult } from './dice/diceTypes';
import { useAuth } from '../../auth/AuthContext';
import { useCampaign } from '../../campaigns/CampaignContext';
import { usePortalContainer } from '../ui/portal-container';
import { useCampaignChannel } from '../../../services/realtime/campaignChannel';
import {
  loadChatMessages,
  sendChatMessage,
  clearChatMessages,
  writeChatLastSeen,
  toggleChatReaction,
  type ChatMessage,
  type ChatQuote,
  type ChatReaction,
} from '../../../services/supabase/chatService';

type ChatTab = 'all' | 'chat' | 'rolls' | 'files';

/** Voce della timeline unificata: messaggio di testo o tiro. */
type TimelineItem =
  | { key: string; time: number; kind: 'message'; message: ChatMessage }
  | { key: string; time: number; kind: 'roll'; roll: RollResult; reactions?: ChatReaction[] };

const TABS: { id: ChatTab; label: string }[] = [
  { id: 'all', label: 'Tutti' },
  { id: 'chat', label: 'Chat' },
  { id: 'rolls', label: 'Tiri' },
  { id: 'files', label: 'File' },
];

/** Contenuto da citare per un item della timeline (testo o sintesi del tiro). */
function quoteForItem(item: TimelineItem): ChatQuote {
  if (item.kind === 'roll') {
    return {
      senderName: item.roll.rollerName,
      kind: 'roll',
      content: `${item.roll.formulaText || item.roll.formulaName || 'Tiro'} → ${item.roll.total}`,
    };
  }
  return {
    senderName: item.message.senderName,
    kind: 'message',
    content: item.message.content,
  };
}

/** Reazioni raggruppate per emoji: [emoji, lista di chi le ha lasciate]. */
function groupReactions(reactions: ChatReaction[] | undefined): Array<[string, ChatReaction[]]> {
  const groups = new Map<string, ChatReaction[]>();
  for (const reaction of reactions ?? []) {
    const list = groups.get(reaction.char) ?? [];
    list.push(reaction);
    groups.set(reaction.char, list);
  }
  return [...groups.entries()];
}

export function SessionChatPanel({ incomingMessage = null }: { incomingMessage?: ChatMessage | null }) {
  const { rolls, rerollResult, clearLocalHistory } = useDiceSession();
  const { user } = useAuth();
  const { activeCampaign } = useCampaign();
  const [activeTab, setActiveTab] = useState<ChatTab>('all');
  const [message, setMessage] = useState('');
  const [entries, setEntries] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const emojiPanelRef = useRef<HTMLDivElement>(null);
  const caretRef = useRef<number | null>(null);
  const focusRequestedRef = useRef(false);
  const inputTouchedRef = useRef(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  // Selezione messaggio (mostra le azioni emoji/citazione) e picker reazioni.
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [hoveredEntryId, setHoveredEntryId] = useState<string | null>(null);
  const [reactionPicker, setReactionPicker] = useState<{ id: string; top: number; left: number } | null>(null);
  const [replyQuote, setReplyQuote] = useState<ChatQuote | null>(null);
  // Container dei portali dentro l'albero [data-dashboard-palette]: ci arrivano
  // le variabili --dash-* (su document.body lo sfondo del picker sarebbe vuoto).
  const portalTarget = usePortalContainer();

  // Reazioni arrivate dagli altri partecipanti: aggiornano l'entry locale.
  const handleChatReactionBroadcast = useCallback((msg: { payload?: Record<string, unknown> } | null) => {
    const payload = msg?.payload;
    const messageId = typeof payload?.messageId === 'string' ? payload.messageId : null;
    const reactions = payload?.reactions;
    if (!messageId || !Array.isArray(reactions)) return;
    const next = reactions as ChatReaction[];
    setEntries((prev) => prev.map((entry) => (
      entry.id === messageId ? { ...entry, reactions: next } : entry
    )));
  }, []);

  const chatChannel = useCampaignChannel(activeCampaign?.id, {
    onBroadcast: { chat_reaction: handleChatReactionBroadcast },
  });

  // Messaggio in tempo reale ricevuto mentre il pannello e' aperto:
  // entra subito in coda (dedup per id: il load dal DB puo' averlo gia').
  useEffect(() => {
    if (!incomingMessage) return;
    setEntries((prev) => (
      prev.some((entry) => entry.id === incomingMessage.id)
        ? prev
        : [...prev, incomingMessage]
    ));
  }, [incomingMessage]);

  useEffect(() => {
    if (!menuOpen) return;
    const outside = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('keydown', escape);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!emojiOpen) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (emojiPanelRef.current?.contains(target)) return;
      if (emojiButtonRef.current?.contains(target)) return;
      setEmojiOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setEmojiOpen(false); };
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('keydown', escape);
    };
  }, [emojiOpen]);

  // Click fuori dai messaggi: deseleziona e chiude il picker delle reazioni.
  // I click dentro una voce [data-chat-entry] o dentro il picker sono gestiti
  // dai rispettivi handler e qui non devono fare nulla.
  useEffect(() => {
    if (!reactionPicker && selectedEntryId === null) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('[data-reaction-picker]')) return;
      if (target?.closest?.('[data-chat-entry]')) return;
      setSelectedEntryId(null);
      setReactionPicker(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setReactionPicker(null);
      setSelectedEntryId(null);
    };
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('keydown', escape);
    };
  }, [reactionPicker, selectedEntryId]);

  // Dopo l'inserimento di un'emoji il valore dell'input cambia: riapplica
  // focus e posizione del cursore (React potrebbe resettarli sul nuovo valore).
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    if (caretRef.current !== null) {
      const caret = caretRef.current;
      caretRef.current = null;
      input.focus();
      input.setSelectionRange(caret, caret);
    } else if (focusRequestedRef.current) {
      focusRequestedRef.current = false;
      input.focus();
    }
  }, [message]);

  const insertEmoji = useCallback((char: string) => {
    const input = inputRef.current;
    let start: number | null = null;
    let end: number | null = null;
    if (input && inputTouchedRef.current) {
      start = input.selectionStart;
      end = input.selectionEnd;
    }
    const caret = (start ?? input?.value.length ?? 0) + char.length;
    setMessage((prev) => (
      start === null ? prev + char : prev.slice(0, start) + char + prev.slice(end ?? start)
    ));
    caretRef.current = caret;
    focusRequestedRef.current = true;
  }, []);

  // Aggiorna la reazione dell'utente su una voce e la broadcasta agli altri.
  const applyReaction = useCallback(async (entryId: string, char: string) => {
    if (!user) return;
    const reactions = await toggleChatReaction(entryId, {
      char,
      userId: user.id,
      userName: user.displayName,
    });
    if (!reactions) return;
    setEntries((prev) => prev.map((entry) => (
      entry.id === entryId ? { ...entry, reactions } : entry
    )));
    void chatChannel.send('chat_reaction', { messageId: entryId, reactions }).catch((error) => {
      console.error('[Chat] Errore broadcast reazione:', error);
    });
  }, [user, chatChannel]);

  // Apre il picker reazioni ancorato al messaggio: sopra se c'è spazio,
  // altrimenti sotto, sempre entro i bordi della finestra.
  const toggleReactionPicker = useCallback((entryId: string, anchor: HTMLElement) => {
    setReactionPicker((prev) => {
      if (prev?.id === entryId) return null;
      const rect = anchor.getBoundingClientRect();
      const pickerWidth = 360;
      const pickerHeight = 460;
      const top = rect.top > pickerHeight + 12
        ? rect.top - pickerHeight - 8
        : Math.min(rect.bottom + 8, Math.max(8, window.innerHeight - pickerHeight - 8));
      const left = Math.min(
        Math.max(8, rect.right - pickerWidth),
        Math.max(8, window.innerWidth - pickerWidth - 8),
      );
      return { id: entryId, top, left };
    });
  }, []);

  const handleReactionPick = useCallback((char: string) => {
    const target = reactionPicker;
    setReactionPicker(null);
    if (target) void applyReaction(target.id, char);
  }, [reactionPicker, applyReaction]);

  useEffect(() => {
    if (!activeCampaign) {
      console.log('[Chat] activeCampaign ancora assente, in attesa');
      return;
    }
    console.log(`[Chat] caricamento timeline per campagna ${activeCampaign.id}`);
    setLoading(true);
    loadChatMessages(activeCampaign.id).then((loaded) => {
      console.log(`[Chat] caricate ${loaded.length} voci dal DB`);
      setEntries(loaded);
      setLoading(false);
      // Segna come visto l'ultima voce visualizzata (messaggio o tiro): il
      // pallino sull'icona si basa su questo timestamp (formato ISO del
      // server, confronto esatto).
      const latestSeen = loaded
        .map((entry) => entry.createdAt)
        .sort()
        .pop();
      if (latestSeen) writeChatLastSeen(activeCampaign.id, latestSeen);
    });
  }, [activeCampaign?.id]);

  // Timeline unica: voci dal DB (messaggi + tiri salvati) unite ai tiri locali
  // ancora non presenti nel DB caricato, ordinate per tempo.
  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];
    const dbIds = new Set<string>();
    for (const entry of entries) {
      dbIds.add(entry.id);
      const time = Date.parse(entry.createdAt) || 0;
      if (entry.kind === 'roll' && entry.roll) {
        items.push({ key: entry.id, time, kind: 'roll', roll: entry.roll, reactions: entry.reactions });
      } else {
        items.push({ key: entry.id, time, kind: 'message', message: entry });
      }
    }
    for (const roll of rolls) {
      if (dbIds.has(roll.id)) continue;
      items.push({ key: roll.id, time: roll.createdAt, kind: 'roll', roll });
    }
    items.sort((a, b) => a.time - b.time);
    return items;
  }, [entries, rolls]);

  const visibleItems = useMemo(() => timeline.filter((item) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'files') return false;
    if (activeTab === 'rolls') return item.kind === 'roll';
    return item.kind === 'message' || item.roll.origin === 'modifier';
  }), [timeline, activeTab]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visibleItems.length, activeTab, loading]);

  const handleSend = async () => {
    const text = message.trim();
    if (!text) return;
    if (!user || !activeCampaign) {
      console.warn('[Chat] invio bloccato, dati mancanti:', {
        hasUser: !!user,
        campaignId: activeCampaign?.id ?? null,
      });
      return;
    }
    console.log(`[Chat] invio messaggio per campagna ${activeCampaign.id}...`);
    // L'invio richiude le finestre emoji aperte (picker testo e picker reazioni).
    setEmojiOpen(false);
    setReactionPicker(null);
    const saved = await sendChatMessage({
      campaignId: activeCampaign.id,
      senderId: user.id,
      senderName: user.displayName,
      senderAvatarUrl: user.avatarUrl,
      content: text,
      quote: replyQuote ?? undefined,
    });
    if (saved) {
      console.log(`[chatService] Messaggio salvato: ${saved.id}`);
      setEntries((prev) => [...prev, saved]);
      setMessage('');
      setReplyQuote(null);
      // Anche il proprio messaggio diventa "visto", altrimenti al riaprire
      // l'app il pallino si accenderebbe per un messaggio appena inviato.
      writeChatLastSeen(activeCampaign.id, saved.createdAt);
      // Avvisa gli altri partecipanti della campagna (pallino + inserimento
      // live nella loro timeline se hanno la chat aperta).
      void chatChannel.send('chat_message', { entry: saved }).catch((error) => {
        console.error('[Chat] Errore broadcast messaggio chat:', error);
      });
    } else {
      console.warn('[Chat] invio FALLITO (vedi errore [chatService])');
    }
  };

  const handleClearChat = async () => {
    setConfirmClear(false);
    setMenuOpen(false);
    if (!activeCampaign) return;
    await clearChatMessages(activeCampaign.id);
    // Ricarica dal DB: mostra esattamente ciò che la RLS ha permesso di
    // cancellare (GM: tutta la timeline; giocatore: i propri messaggi).
    const fresh = await loadChatMessages(activeCampaign.id);
    setEntries(fresh);
    // Anche i tiri locali di sessione vanno svuotati, altrimenti la timeline
    // li ri-aggiungerebbe in merge pur essendo stati cancellati dal DB.
    clearLocalHistory();
    console.log('[Chat] chat svuotata');
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--dash-panel)]">
      <div className="flex shrink-0 items-center gap-1 border-b border-[var(--dash-border)] px-3 pt-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`relative px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-[var(--dash-text-strong)]'
                : 'text-[var(--dash-muted)] hover:text-[var(--dash-text)]'
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[var(--dash-accent)]" />
            )}
          </button>
        ))}
        <div ref={menuRef} className="relative ml-auto">
          <button
            type="button"
            aria-label="Menu chat"
            onClick={() => setMenuOpen((open) => !open)}
            className="rounded-md p-1.5 text-[var(--dash-muted)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)]"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-panel)] p-1 shadow-lg">
              <button
                type="button"
                onClick={() => { setMenuOpen(false); setConfirmClear(true); }}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-[var(--dash-danger-text)] transition-colors hover:bg-[var(--dash-danger-bg)]"
              >
                <Trash2 className="h-3.5 w-3.5 shrink-0" />
                Pulisci chat
              </button>
            </div>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-[var(--dash-muted)]">Caricamento chat...</p>
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <MessageSquare className="h-8 w-8 text-[var(--dash-muted)] opacity-40" />
            <p className="text-sm text-[var(--dash-muted)]">
              {activeTab === 'files' ? 'Nessun file condiviso' : 'Nessun messaggio ancora'}
            </p>
            <p className="text-xs text-[var(--dash-muted)] opacity-60">
              Scrivi qualcosa per iniziare la conversazione
            </p>
          </div>
        ) : (
          <>
            {visibleItems.map((item) => {
              const reactions = item.kind === 'message' ? item.message.reactions : item.reactions;
              const grouped = groupReactions(reactions);
              // I tiri solo-locali non hanno riga nel DB: niente reazioni su di essi.
              const canAct = item.kind === 'message' || item.reactions !== undefined;
              const showActions = canAct && (selectedEntryId === item.key || hoveredEntryId === item.key);
              const actions = showActions ? (
                <div className="absolute -top-3 right-0 z-20 flex gap-1">
                  <button
                    type="button"
                    aria-label="Reagisci con emoji"
                    title="Reagisci con emoji"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleReactionPicker(item.key, event.currentTarget);
                    }}
                    className="rounded-full border border-[var(--dash-border)] bg-[var(--dash-panel)] p-1 text-[var(--dash-muted)] shadow-sm transition-colors hover:text-[var(--dash-accent)]"
                  >
                    <Smile className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Citazione"
                    title="Citazione"
                    onClick={(event) => {
                      event.stopPropagation();
                      setReactionPicker(null);
                      setReplyQuote(quoteForItem(item));
                      inputRef.current?.focus();
                    }}
                    className="rounded-full border border-[var(--dash-border)] bg-[var(--dash-panel)] p-1 text-[var(--dash-muted)] shadow-sm transition-colors hover:text-[var(--dash-accent)]"
                  >
                    <Quote className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null;
              const badges = grouped.length > 0 ? (
                <div
                  className="absolute -bottom-3 right-2 z-10 flex items-center gap-0.5 rounded-full border border-[var(--dash-border)] bg-[var(--dash-panel)] px-1 py-0.5 shadow-sm"
                  title={grouped.map(([, list]) => list.map((reaction) => reaction.userName).join(', ')).join(' · ')}
                >
                  {grouped.map(([char, list]) => {
                    const mine = Boolean(user && list.some((reaction) => reaction.userId === user.id));
                    const names = list.map((reaction) => reaction.userName).join(', ');
                    return (
                      <button
                        key={char}
                        type="button"
                        title={names}
                        aria-label={`Reazione ${char}: ${names}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          void applyReaction(item.key, char);
                        }}
                        className={`flex items-center gap-0.5 rounded-full px-1 py-0.5 transition-transform hover:scale-110 ${
                          mine ? 'bg-[var(--dash-surface-2)] ring-1 ring-[var(--dash-accent)]' : ''
                        }`}
                      >
                        {flagImageName(char)
                          ? <EmojiFlag char={char} className="h-3.5 w-3.5" />
                          : <span className="text-[13px] leading-none">{char}</span>}
                        {list.length > 1 && (
                          <span className="text-[10px] font-semibold text-[var(--dash-muted)]">{list.length}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : null;
              return (
                <div
                  key={item.key}
                  data-chat-entry
                  className="relative"
                  onClick={() => {
                    setSelectedEntryId(item.key);
                    if (reactionPicker?.id !== item.key) setReactionPicker(null);
                  }}
                  onMouseEnter={() => setHoveredEntryId(item.key)}
                  onMouseLeave={() => setHoveredEntryId((prev) => (prev === item.key ? null : prev))}
                >
                  {item.kind === 'message' ? (
                    <div className="flex items-start gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--dash-border)] bg-[var(--dash-surface-2)]">
                        {item.message.senderAvatarUrl
                          ? <img src={item.message.senderAvatarUrl} alt="" className="h-full w-full object-cover" />
                          : <span className="text-xs font-semibold text-[var(--dash-text)]">{item.message.senderName.slice(0, 1).toUpperCase()}</span>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-[var(--dash-text-strong)]">{item.message.senderName}</div>
                        <div className="relative mt-0.5">
                          <div className="rounded-lg rounded-tl-none border border-[var(--dash-border)] bg-[var(--dash-surface)] px-3 py-2 text-sm text-[var(--dash-text)]">
                            {item.message.quote && (
                              <div className="mb-1.5 border-l-2 border-[var(--dash-accent)] bg-[var(--dash-surface-2)] px-2 py-1">
                                <div className="text-[11px] font-semibold text-[var(--dash-accent)]">
                                  {item.message.quote.senderName}
                                </div>
                                <div className="line-clamp-2 text-xs text-[var(--dash-muted)]">
                                  {item.message.quote.content}
                                </div>
                              </div>
                            )}
                            <FlagText>{item.message.content}</FlagText>
                          </div>
                          {actions}
                          {badges}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      <DiceRollHistoryCard
                        result={item.roll}
                        onReroll={() => { rerollResult(item.roll); }}
                        variant="chat"
                      />
                      {actions}
                      {badges}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-[var(--dash-border)] p-3">
        <div className="relative rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface)] px-3 py-2">
          {replyQuote && (
            <div className="mb-2 flex items-start gap-1.5 border-l-2 border-[var(--dash-accent)] bg-[var(--dash-surface-2)] px-2 py-1">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold text-[var(--dash-accent)]">
                  {replyQuote.senderName}
                </div>
                <div className="truncate text-xs text-[var(--dash-muted)]">
                  {replyQuote.content}
                </div>
              </div>
              <button
                type="button"
                aria-label="Annulla citazione"
                title="Annulla citazione"
                onClick={() => { setReplyQuote(null); inputRef.current?.focus(); }}
                className="shrink-0 rounded p-0.5 text-[var(--dash-muted)] transition-colors hover:text-[var(--dash-text)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') handleSend(); }}
              onFocus={() => { inputTouchedRef.current = true; }}
              placeholder={replyQuote ? 'Rispondi...' : 'Scrivi qualcosa...'}
              className="min-w-0 flex-1 bg-transparent text-sm text-[var(--dash-text)] outline-none placeholder:text-[var(--dash-muted)]"
            />
            <button type="button" aria-label="Allega" className="rounded-md p-1 text-[var(--dash-muted)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)]">
              <Plus className="h-4 w-4" />
            </button>
            <button type="button" aria-label="Immagine" className="rounded-md p-1 text-[var(--dash-muted)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)]">
              <ImageIcon className="h-4 w-4" />
            </button>
            <button
              ref={emojiButtonRef}
              type="button"
              aria-label="Emoji"
              aria-expanded={emojiOpen}
              onClick={() => setEmojiOpen((open) => !open)}
              className={`rounded-md p-1 transition-colors ${
                emojiOpen
                  ? 'bg-[var(--dash-surface-2)] text-[var(--dash-accent)]'
                  : 'text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)]'
              }`}
            >
              <Smile className="h-4 w-4" />
            </button>
            {emojiOpen && (
              <div ref={emojiPanelRef} className="absolute bottom-full right-0 z-50 mb-2">
                <EmojiPicker onPick={insertEmoji} />
              </div>
            )}
          </div>
        </div>
      </div>

      {reactionPicker && createPortal(
        // Portal fuori dallo SlideOverPanel (transform/backdrop-filter/overflow
        // ridefiniscono il containing block del fixed e taglierebbero il picker)
        // ma dentro l'albero con le variabili --dash-*. z-960 > z-900 del
        // pannello, sotto i dialoghi (z-9999).
        <div
          data-reaction-picker
          className="fixed z-[960]"
          style={{ top: reactionPicker.top, left: reactionPicker.left }}
        >
          <EmojiPicker onPick={handleReactionPick} />
        </div>,
        portalTarget ?? document.body,
      )}

      {confirmClear && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Pulisci chat">
          <div className="w-full max-w-sm rounded-lg border border-[var(--dash-border)] bg-[var(--dash-panel)] p-4 shadow-xl">
            <h2 className="text-sm font-semibold text-[var(--dash-text-strong)]">Pulisci chat</h2>
            <p className="mt-2 text-xs leading-relaxed text-[var(--dash-muted)]">
              Sei sicuro di voler cancellare la chat? Verranno eliminati anche tutti gli allegati condivisi. Questa azione non può essere annullata.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="flex flex-1 items-center justify-center rounded-md border border-[var(--dash-border)] bg-[var(--dash-surface)] px-3 py-1.5 text-xs text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-surface-2)]"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={() => { void handleClearChat(); }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-[var(--dash-danger-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--dash-danger-text)] transition-colors hover:brightness-110"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Pulisci
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
