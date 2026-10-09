import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent as ReactChangeEvent, type ClipboardEvent as ReactClipboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquare, Plus, Smile, MoreVertical, Trash2, Quote, X, Check, FileDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Copy } from '../IconeCopia';
import { ImageSun } from '../IconeImmagine';
import { ChatImageAttachment } from './ChatImageAttachment';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { useDiceSession } from './dice/DiceSessionContext';
import { EmojiPicker } from './EmojiPicker';
import { parseQuotedPaste } from './chatPaste';
import {
  MAX_ATTACHMENT_BYTES,
  chatImageClipboardBlob,
  readChatImageSize,
  saveAttachmentToDisk,
  splitAttachmentName,
  uploadChatAttachment,
} from './chatAttachments';
import { EmojiFlag, FlagText, flagImageName } from './EmojiFlag';
import { DiceRollHistoryCard } from './dice/DiceRollHistoryCard';
import { CustomDieFaceResult } from './dice/CustomDieFaceResult';
import type { RollResult } from './dice/diceTypes';
import { formatPrimaryRollResult, rollResultSummary } from './dice/diceResultSummary';
import { useAuth } from '../../auth/AuthContext';
import { useCampaign } from '../../campaigns/CampaignContext';
import { usePortalContainer } from '../ui/portal-container';
import { useCampaignChannel } from '../../../services/realtime/campaignChannel';
import {
  loadChatMessages,
  sendChatMessage,
  sendChatAttachment,
  clearChatMessages,
  writeChatLastSeen,
  toggleChatReaction,
  deleteChatMessage,
  type ChatAttachment,
  type ChatMessage,
  type ChatQuote,
  type ChatReaction,
} from '../../../services/supabase/chatService';
import { removeContentAsset } from '../../../services/storage/contentAssets';

type ChatTab = 'all' | 'chat' | 'rolls' | 'files';

/** Voce della timeline unificata: messaggio di testo, tiro o allegato file. */
type TimelineItem =
  | { key: string; time: number; kind: 'message'; message: ChatMessage }
  | { key: string; time: number; kind: 'roll'; roll: RollResult; reactions?: ChatReaction[] }
  | { key: string; time: number; kind: 'attachment'; message: ChatMessage };

const TABS: { id: ChatTab; label: string }[] = [
  { id: 'all', label: 'Tutti' },
  { id: 'chat', label: 'Chat' },
  { id: 'rolls', label: 'Tiri' },
  { id: 'files', label: 'File' },
];

/** Faccia custom raggruppata per la citazione: stessa identita' visiva
 (icona/immagine/testo) = un blocco con il conteggio "xN". */
function customDiceFacesForRoll(roll: RollResult): NonNullable<ChatQuote['diceFaces']> {
  const faces = new Map<string, NonNullable<ChatQuote['diceFaces']>[number]>();
  for (const group of roll.diceGroups) {
    for (const die of group.rolls) {
      if (!die.active || die.physicalRole === 'units' || !die.customFace) continue;
      const visual = die.customFace.visual;
      const key = visual.kind === 'icon'
        ? `icon:${visual.iconName}`
        : visual.kind === 'image'
          ? `image:${visual.publicUrl}`
          : `text:${visual.text}`;
      const existing = faces.get(key);
      if (existing) {
        existing.count += 1;
        continue;
      }
      faces.set(key, {
        face: die.customFace,
        symbolColor: die.customFace.symbolColor ?? group.customDieSnapshot?.symbolColor,
        bodyColor: group.customDieSnapshot?.bodyColor,
        skinId: group.customDieSnapshot?.skinId,
        textureScale: group.customDieSnapshot?.textureScale,
        count: 1,
      });
    }
  }
  return [...faces.values()];
}

/** Contenuto della citazione: per i tiri con dadi custom mostra le facce
 visive (icona/immagine xN) invece della conversione testuale; per il resto
 il testo come prima. */
function ChatQuoteContent({ quote }: { quote: ChatQuote }) {
  if (quote.image) {
    return <div className="w-24 max-w-full"><ChatImageAttachment attachment={quote.image} onDownload={() => { void saveAttachmentToDisk(quote.image!).catch(() => toast.error('Impossibile scaricare l’immagine.')); }} /></div>;
  }
  const diceFaces = quote.diceFaces;
  if (!diceFaces || diceFaces.length === 0) {
    return <div className="line-clamp-2 text-xs text-[var(--dash-muted)]">{quote.content}</div>;
  }
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {quote.content && (
        <span className="min-w-0 truncate text-xs text-[var(--dash-muted)]">{quote.content}</span>
      )}
      {diceFaces.map((item, index) => (
        <span
          key={`${item.face.index}:${item.face.visual.kind}:${index}`}
          className="inline-flex shrink-0 items-center gap-1"
          title={item.face.label ?? undefined}
        >
          <CustomDieFaceResult
            face={item.face}
            className="h-4 w-4"
            symbolColor={item.symbolColor}
            bodyColor={item.bodyColor}
            skinId={item.skinId}
            textureScale={item.textureScale}
          />
          {item.count > 1 && (
            <span className="text-[11px] font-semibold text-[var(--dash-muted)]">×{item.count}</span>
          )}
        </span>
      ))}
    </div>
  );
}

/** Avatar del mittente: condiviso dalla bolla messaggio e dalla card allegato. */
function ChatSenderAvatar({ message }: { message: ChatMessage }) {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--dash-border)] bg-[var(--dash-surface-2)]">
      {message.senderAvatarUrl
        ? <img src={message.senderAvatarUrl} alt="" className="h-full w-full object-cover" />
        : <span className="text-xs font-semibold text-[var(--dash-text)]">{message.senderName.slice(0, 1).toUpperCase()}</span>}
    </div>
  );
}

/** Contenuto da citare per un item della timeline (testo o sintesi del tiro). */
function quoteForItem(item: TimelineItem): ChatQuote {
  if (item.kind === 'roll') {
    const quote: ChatQuote = {
      senderName: item.roll.rollerName,
      kind: 'roll',
      content: rollResultSummary(item.roll),
    };
    const diceFaces = customDiceFacesForRoll(item.roll);
    if (diceFaces.length > 0) {
      // Le facce visive sostituiscono l'elenco testuale: il contenuto resta
      // solo la formula (con il totale, quando il tiro e' traducibile).
      const formula = item.roll.formulaText || item.roll.formulaName || 'Tiro';
      const primary = formatPrimaryRollResult(item.roll);
      quote.diceFaces = diceFaces;
      quote.content = primary !== null ? `${formula} → ${primary}` : formula;
    }
    return quote;
  }
  if (item.kind === 'attachment') {
    return {
      senderName: item.message.senderName,
      kind: 'message',
      content: item.message.attachment?.fileName ?? '',
      image: item.message.attachment?.display === 'image' ? item.message.attachment : undefined,
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

/** Testo della voce per la copia negli appunti. La citazione resta marcata
 come blockquote ("> ") cosi' che l'incollo nel composer la riconosca e
 ricostruisca la struttura citazione invece di buttare tutto nel testo. */
function copyTextOfItem(item: TimelineItem): string {
  // Rappresentazione testuale del file; le immagini vengono copiate come PNG.
  if (item.kind === 'attachment') return item.message.attachment?.fileName ?? '';
  if (item.kind === 'message') {
    const quote = item.message.quote;
    if (quote) {
      const quoted = `${quote.senderName}: ${quote.content}`
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
      return `${quoted}\n\n${item.message.content}`;
    }
    return item.message.content;
  }
  const roll = item.roll;
  return `${roll.rollerName}: ${rollResultSummary(roll)}`;
}

export function SessionChatPanel({ incomingMessage = null }: { incomingMessage?: ChatMessage | null }) {
  const { rolls, rerollResult, clearLocalHistory, removeRoll } = useDiceSession();
  const { user } = useAuth();
  const { activeCampaign } = useCampaign();
  const [activeTab, setActiveTab] = useState<ChatTab>('all');
  const [message, setMessage] = useState('');
  const [entries, setEntries] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  // Dialog di conferma cancellazione (id della voce) e feedback "Copiato".
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // File picker nascosto del pulsante "+" (qualsiasi tipo di file) e stato di
  // caricamento per disabilitare il bottone durante l'upload.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const emojiPanelRef = useRef<HTMLDivElement>(null);
  const caretRef = useRef<number | null>(null);
  const focusRequestedRef = useRef(false);
  const inputTouchedRef = useRef(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  // Hover della voce (mostra i tre puntini) e menu kebab aperto (id della voce).
  const [hoveredEntryId, setHoveredEntryId] = useState<string | null>(null);
  const [kebabOpenId, setKebabOpenId] = useState<string | null>(null);
  const [kebabOpensUp, setKebabOpensUp] = useState(false);
  const [reactionPicker, setReactionPicker] = useState<{ id: string; top: number; left: number } | null>(null);
  const [replyQuote, setReplyQuote] = useState<ChatQuote | null>(null);
  // Reazioni sui tiri di sessione: la loro riga in `entries` potrebbe non
  // esserci ancora (o non esserci mai, tiri segreti), quindi lo stato delle
  // reazioni vive qui ed e' unito alla timeline nel merge.
  const [sessionRollReactions, setSessionRollReactions] = useState<Record<string, ChatReaction[]>>({});
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
    setSessionRollReactions((prev) => ({ ...prev, [messageId]: next }));
  }, []);

  // Voce cancellata da un altro partecipante: la rimuove dalla timeline e
  // anche dalla copia locale del tiro (se e' presente nella sessione).
  const handleChatDeleteBroadcast = useCallback((msg: { payload?: Record<string, unknown> } | null) => {
    const messageId = typeof msg?.payload?.messageId === 'string' ? msg.payload.messageId : null;
    if (!messageId) return;
    setEntries((prev) => prev.filter((entry) => entry.id !== messageId));
    removeRoll(messageId);
  }, [removeRoll]);

  const chatChannel = useCampaignChannel(activeCampaign?.id, {
    onBroadcast: {
      chat_reaction: handleChatReactionBroadcast,
      chat_delete: handleChatDeleteBroadcast,
    },
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

  // Click fuori dal picker delle reazioni: lo chiude. I click dentro una voce
  // [data-chat-entry] o dentro il picker sono gestiti dai rispettivi handler
  // e qui non devono fare nulla.
  useEffect(() => {
    if (!reactionPicker) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('[data-reaction-picker]')) return;
      if (target?.closest?.('[data-chat-entry]')) return;
      setReactionPicker(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setReactionPicker(null);
    };
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('keydown', escape);
    };
  }, [reactionPicker]);

  // Menu kebab (tre puntini): click fuori dal menu o Escape lo chiudono.
  useEffect(() => {
    if (!kebabOpenId) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('[data-chat-kebab]')) return;
      setKebabOpenId(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setKebabOpenId(null);
    };
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('keydown', escape);
    };
  }, [kebabOpenId]);

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

  // Incollo intelligente nel composer: il formato "> Nome: citazione\n\ncorpo"
  // prodotto dalla copia viene riconosciuto (parseQuotedPaste) e ricostruisce
  // la citazione strutturata (banner di risposta) con il resto nel campo.
  const handleComposerPaste = (event: ReactClipboardEvent<HTMLInputElement>) => {
    const imageItem = Array.from(event.clipboardData.items).find((item) => item.kind === 'file' && item.type.startsWith('image/'));
    const image = imageItem?.getAsFile();
    if (image) {
      event.preventDefault();
      void handleAttachmentFile(image, 'image');
      return;
    }
    const parsed = parseQuotedPaste(event.clipboardData.getData('text/plain'));
    if (!parsed) return;
    event.preventDefault();
    setReplyQuote({ senderName: parsed.senderName, content: parsed.content, kind: 'message' });
    const input = event.currentTarget;
    let start: number | null = null;
    let end: number | null = null;
    if (inputTouchedRef.current) {
      start = input.selectionStart;
      end = input.selectionEnd;
    }
    const caret = (start ?? input.value.length) + parsed.body.length;
    setMessage((prev) => (
      start === null ? prev + parsed.body : prev.slice(0, start) + parsed.body + prev.slice(end ?? start)
    ));
    caretRef.current = caret;
    focusRequestedRef.current = true;
  };

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
    setSessionRollReactions((prev) => ({ ...prev, [entryId]: reactions }));
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

  // Cancella la voce senza conferme: la toglie subito dalla timeline, la
  // elimina dal DB (se la riga esiste) e lo broadcasta agli altri client.
  const deleteEntry = useCallback(async (entryId: string) => {
    setReactionPicker(null);
    const target = entries.find((entry) => entry.id === entryId);
    setEntries((prev) => prev.filter((entry) => entry.id !== entryId));
    // Toglie anche la copia locale del tiro: senza questo il merge dei tiri
    // di sessione riporterebbe la voce appena cancellata.
    removeRoll(entryId);
    await deleteChatMessage(entryId);
    // Allegato proprio: elimina anche i bytes dallo storage (best effort).
    // Solo i miei: per quelli degli altri la RLS potrebbe non cancellare la
    // riga e il file resterebbe comunque raggiungibile dalla chat.
    if (target?.kind === 'attachment' && target.attachment && user && target.senderId === user.id) {
      void removeContentAsset(target.attachment.bucket, target.attachment.assetPath, target.attachment.storage)
        .catch((error) => console.warn('[Chat] Allegato non rimosso dallo storage:', error));
    }
    void chatChannel.send('chat_delete', { messageId: entryId }).catch((error) => {
      console.error('[Chat] Errore broadcast cancellazione:', error);
    });
  }, [chatChannel, removeRoll, entries, user]);

  // Copia: solo negli appunti (feedback "Copiato" per 1,5s). NON tocca il
  // composer: il testo puo' essere incollato in un'altra chat o in un altro
  // programma, e incollando qui dentro il formato blockquote viene comunque
  // riconosciuto da handleComposerPaste. Per citare nella stessa chat c'e' il
  // bottone Citazione.
  const copyEntry = useCallback((entry: TimelineItem) => {
    const image = entry.kind === 'attachment' && entry.message.attachment?.display === 'image' ? entry.message.attachment : undefined;
    if (image && (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined')) {
      toast.error('Questo browser non supporta la copia delle immagini negli appunti.');
      return;
    }
    const copy = image
      ? navigator.clipboard.write([new ClipboardItem({ 'image/png': chatImageClipboardBlob(image) })])
      : navigator.clipboard.writeText(copyTextOfItem(entry));
    void copy.then(() => {
      setCopiedId(entry.key);
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopiedId(null), 1500);
    }).catch((error) => {
      console.warn('[Chat] Copia negli appunti non riuscita:', error);
      toast.error('Impossibile copiare negli appunti.');
    });
  }, []);

  useEffect(() => () => {
    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
  }, []);

  // Click sulla card allegato: apre la finestra "Salva con nome" con il file
  // pronto su disco (dove la File System Access API non c'e' si ripiega sul
  // download del browser).
  const handleDownloadAttachment = useCallback((message: ChatMessage) => {
    const attachment = message.attachment;
    if (!attachment) return;
    saveAttachmentToDisk(attachment).catch((error) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      console.error('[Chat] Download allegato non riuscito:', error);
      toast.error('Impossibile scaricare il file.');
    });
  }, []);

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
      } else if (entry.kind === 'attachment') {
        items.push({ key: entry.id, time, kind: 'attachment', message: entry });
      } else {
        items.push({ key: entry.id, time, kind: 'message', message: entry });
      }
    }
    for (const roll of rolls) {
      if (dbIds.has(roll.id)) continue;
      // Le reazioni dei tiri di sessione vivono in sessionRollReactions: la
      // riga in `entries` puo' non esserci ancora (salvataggio a fine tiro).
      items.push({ key: roll.id, time: roll.createdAt, kind: 'roll', roll, reactions: sessionRollReactions[roll.id] ?? [] });
    }
    items.sort((a, b) => a.time - b.time);
    return items;
  }, [entries, rolls, sessionRollReactions]);

  const visibleItems = useMemo(() => timeline.filter((item) => {
    if (activeTab === 'all') return true;
    // Il tab File elenca solo gli allegati; la Chat resta per testi (e tiri
    // modifier), i Tiri per il resto.
    if (activeTab === 'files') return item.kind === 'attachment';
    if (activeTab === 'rolls') return item.kind === 'roll';
    return item.kind === 'message' || (item.kind === 'roll' && item.roll.origin === 'modifier');
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
    // Prima di svuotare la timeline elimina dallo storage i bytes dei MIEI
    // allegati (best effort): quelli degli altri restano intatti perche' la
    // RLS potrebbe non cancellarne la riga e il file deve restare valido.
    for (const entry of entries) {
      if (entry.kind === 'attachment' && entry.attachment && user && entry.senderId === user.id) {
        try {
          await removeContentAsset(entry.attachment.bucket, entry.attachment.assetPath, entry.attachment.storage);
        } catch (error) {
          console.warn('[Chat] Allegato non rimosso dallo storage:', error);
        }
      }
    }
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

  // Pulsante "+" della composer: qualsiasi tipo di file, max 50 MB. Il file
  // viene caricato nel posto giusto scelto dall'utente (Locale = IndexedDB,
  // Cloud = bucket Storage) e poi condiviso in chat come card cliccabile.
  const handleFilePicked = async (event: ReactChangeEvent<HTMLInputElement>, display?: 'image') => {
    const file = event.target.files?.[0];
    // Reset immediato: permette di riesceglierlo anche dopo un errore.
    event.target.value = '';
    if (!file) return;
    await handleAttachmentFile(file, display);
  };

  const handleAttachmentFile = async (file: File, display?: 'image') => {
    if (uploadingFile) return;
    if (display === 'image' && !file.type.startsWith('image/')) {
      toast.error('Seleziona un file immagine.');
      return;
    }
    if (!user || !activeCampaign) {
      toast.error('Impossibile condividere il file: campagna o account non disponibili.');
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast.error(`"${file.name}" supera la dimensione massima di 50 MB.`);
      return;
    }
    setUploadingFile(true);
    let attachment: ChatAttachment | null = null;
    try {
      const imageSize = display === 'image' ? await readChatImageSize(file) : undefined;
      attachment = await uploadChatAttachment({
        file,
        campaignId: activeCampaign.id,
        userId: user.id,
      });
      if (display === 'image') Object.assign(attachment, { display: 'image', ...imageSize });
      const saved = await sendChatAttachment({
        campaignId: activeCampaign.id,
        senderId: user.id,
        senderName: user.displayName,
        senderAvatarUrl: user.avatarUrl,
        attachment,
      });
      if (!saved) throw new Error('Salvataggio allegato non riuscito');
      setEntries((prev) => [...prev, saved]);
      // L'allegato e' visibile solo nei tab Tutti/File: dopo un invio riuscito
      // passa a Tutti, altrimenti chi e' su un altro tab vedrebbe "nulla".
      setActiveTab('all');
      console.log('[Chat] Allegato condiviso:', saved.content);
      // Anche il proprio allegato diventa "visto" (pallino come per i testi).
      writeChatLastSeen(activeCampaign.id, saved.createdAt);
      void chatChannel.send('chat_message', { entry: saved }).catch((error) => {
        console.error('[Chat] Errore broadcast allegato chat:', error);
      });
    } catch (error) {
      // Upload riuscito ma insert fallito (o upload fallito): se i bytes ci
      // sono non lasciarli orfani nello storage.
      if (attachment) {
        void removeContentAsset(attachment.bucket, attachment.assetPath, attachment.storage)
          .catch(() => { /* best effort */ });
      }
      console.error('[Chat] Caricamento allegato non riuscito:', error);
      toast.error(error instanceof Error && error.message ? error.message : 'Caricamento del file non riuscito.');
    } finally {
      setUploadingFile(false);
    }
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

      <div ref={scrollRef} className="session-chat-scroll min-h-0 flex-1 space-y-2 overflow-y-auto p-3 pr-5">
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
            {activeTab !== 'files' && (
              <p className="text-xs text-[var(--dash-muted)] opacity-60">
                Scrivi qualcosa per iniziare la conversazione
              </p>
            )}
          </div>
        ) : (
          <>
            {visibleItems.map((item) => {
              const reactions = item.kind === 'roll' ? item.reactions : item.message.reactions;
              const grouped = groupReactions(reactions);
              const attachment = item.kind === 'attachment' ? item.message.attachment : undefined;
              const attachmentName = splitAttachmentName(attachment?.fileName ?? '');
              const canQuoteAndCopy = item.kind !== 'attachment' || attachment?.display === 'image';
              // Tre puntini nel gutter destro (fuori dal post, tra il post e
              // la scrollbar), visibili solo all'hover della voce; il menu che
              // si apre al click elenca le sole icone, in colonna. Sui file
              // generici solo Reagisci e Cancella; sulle immagini anche Citazione/Copia.
              // Reagire serve pero' una riga
              // persistita: i tiri segreti non hanno riga in chat su cui
              // salvare la reazione.
              const canReact = item.kind !== 'roll' || item.roll.visibility === 'public';
              const showKebab = hoveredEntryId === item.key || kebabOpenId === item.key;
              const kebab = showKebab ? (
                <div data-chat-kebab className="absolute -right-5 inset-y-0 z-40 w-5">
                  <button
                    type="button"
                    aria-label="Menu azioni"
                    title="Menu azioni"
                    onClick={(event) => {
                      event.stopPropagation();
                      setReactionPicker(null);
                      const buttonRect = event.currentTarget.getBoundingClientRect();
                      const viewportRect = scrollRef.current?.getBoundingClientRect();
                      const actionCount = (canReact ? 1 : 0) + (canQuoteAndCopy ? 2 : 0) + 1;
                      const menuHeight = actionCount * 25 + 10;
                      setKebabOpensUp((viewportRect?.bottom ?? window.innerHeight) - buttonRect.bottom < menuHeight + 8);
                      setKebabOpenId((prev) => (prev === item.key ? null : item.key));
                    }}
                    className="mt-1 flex h-5 w-5 items-center justify-center rounded-md text-[var(--dash-muted)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)]"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                  {kebabOpenId === item.key && (
                    <div className={`absolute right-0 z-50 flex flex-col items-center gap-1 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-panel)] p-1 shadow-lg ${kebabOpensUp ? 'top-1 -mt-1 -translate-y-full' : 'top-6 mt-1'}`}>
                      {canReact && (
                        <button
                          type="button"
                          aria-label="Reagisci con emoji"
                          title="Reagisci con emoji"
                          onClick={(event) => {
                            event.stopPropagation();
                            setKebabOpenId(null);
                            toggleReactionPicker(item.key, event.currentTarget);
                          }}
                          className="rounded-full border border-[var(--dash-border)] bg-[var(--dash-panel)] p-1 text-[var(--dash-muted)] shadow-sm transition-colors hover:text-[var(--dash-accent)]"
                        >
                          <Smile className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {canQuoteAndCopy && (
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
                      )}
                      {canQuoteAndCopy && (
                        <button
                          type="button"
                          aria-label={copiedId === item.key ? 'Copiato' : 'Copia'}
                          title={copiedId === item.key ? 'Copiato!' : 'Copia'}
                          onClick={(event) => {
                            event.stopPropagation();
                            setReactionPicker(null);
                            copyEntry(item);
                          }}
                          className="rounded-full border border-[var(--dash-border)] bg-[var(--dash-panel)] p-1 text-[var(--dash-muted)] shadow-sm transition-colors hover:text-[var(--dash-accent)]"
                        >
                          {copiedId === item.key
                            ? <Check className="h-3.5 w-3.5" />
                            : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label="Cancella"
                        title="Cancella"
                        onClick={(event) => {
                          event.stopPropagation();
                          setReactionPicker(null);
                          setConfirmDelete(item.key);
                        }}
                        className="rounded-full border border-[var(--dash-border)] bg-[var(--dash-panel)] p-1 text-[var(--dash-muted)] shadow-sm transition-colors hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ) : null;
              const badges = grouped.length > 0 ? (
                <div
                  className="absolute -bottom-3 right-2 z-10 flex items-center gap-0.5 rounded-full border border-[var(--dash-border)] bg-[var(--dash-panel)] px-1 py-0.5 shadow-sm"
                  title={grouped.map(([, list]) => list.map((reaction) => reaction.userName).join(', ')).join(' · ')}
                >
                  {grouped.map(([char, list]) => {
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
                        className="flex items-center gap-0.5 rounded-full px-1 py-0.5 transition-transform hover:scale-110"
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
                    if (reactionPicker?.id !== item.key) setReactionPicker(null);
                  }}
                  onMouseEnter={() => setHoveredEntryId(item.key)}
                  onMouseLeave={() => setHoveredEntryId((prev) => (prev === item.key ? null : prev))}
                >
                  {item.kind === 'message' ? (
                    <div className="flex items-start gap-2">
                      <ChatSenderAvatar message={item.message} />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-[var(--dash-text-strong)]">{item.message.senderName}</div>
                        <div className="relative mt-0.5">
                          <div className="rounded-lg rounded-tl-none border border-[var(--dash-border)] bg-[var(--dash-surface)] px-3 py-2 text-sm text-[var(--dash-text)]">
                            {item.message.quote && (
                              <div className="mb-1.5 border-l-2 border-[var(--dash-accent)] bg-[var(--dash-surface-2)] px-2 py-1">
                                <div className="text-[11px] font-semibold text-[var(--dash-accent)]">
                                  {item.message.quote.senderName}
                                </div>
                                <ChatQuoteContent quote={item.message.quote} />
                              </div>
                            )}
                            <FlagText>{item.message.content}</FlagText>
                          </div>
                          {badges}
                        </div>
                      </div>
                    </div>
                  ) : item.kind === 'attachment' ? (
                    <div className="flex items-start gap-2">
                      <ChatSenderAvatar message={item.message} />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-[var(--dash-text-strong)]">{item.message.senderName}</div>
                        <div className="relative mt-0.5">
                          {/* Immagine proporzionale o card file; click = Salva con nome. */}
                          {attachment?.display === 'image' ? (
                            <ChatImageAttachment attachment={attachment} onDownload={() => handleDownloadAttachment(item.message)} />
                          ) : (
                            <button
                              type="button"
                              aria-label={`Scarica ${attachment?.fileName ?? 'file'}`}
                              onClick={() => handleDownloadAttachment(item.message)}
                              className="flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg rounded-tl-none border border-[var(--dash-border)] bg-[var(--dash-surface)] px-3 py-2 text-left text-sm text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-surface-2)]"
                            >
                              <FileDown className="h-4 w-4 shrink-0 text-[var(--dash-accent)]" aria-hidden="true" />
                              <span className="min-w-0 truncate font-semibold">
                                {attachmentName.base}
                                <span className="font-normal text-[var(--dash-muted)]">{attachmentName.ext}</span>
                              </span>
                            </button>
                          )}
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
                      {badges}
                    </div>
                  )}
                  {kebab}
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
                <ChatQuoteContent quote={replyQuote} />
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
              onPaste={handleComposerPaste}
              onKeyDown={(event) => { if (event.key === 'Enter') handleSend(); }}
              onFocus={() => { inputTouchedRef.current = true; }}
              placeholder={replyQuote ? 'Rispondi...' : 'Scrivi qualcosa...'}
              className="min-w-0 flex-1 bg-transparent text-sm text-[var(--dash-text)] outline-none placeholder:text-[var(--dash-muted)]"
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Inserisci file"
                  disabled={uploadingFile}
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-md p-1 text-[var(--dash-muted)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)] disabled:opacity-40"
                >
                  {uploadingFile
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Plus className="h-4 w-4" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Inserisci file</TooltipContent>
            </Tooltip>
            {/* Qualsiasi tipo di file (nessun accept): il limite dei 50 MB e
                il routing Locale/Cloud sono gestiti in handleFilePicked. */}
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFilePicked} />
            <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => { void handleFilePicked(event, 'image'); }} />
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" aria-label="Inserisci immagine" disabled={uploadingFile} onClick={() => imageInputRef.current?.click()} className="rounded-md p-1 text-[var(--dash-muted)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)] disabled:opacity-40">
                  <ImageSun className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Inserisci immagine</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  ref={emojiButtonRef}
                  type="button"
                  aria-label="Inserisci emoji"
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
              </TooltipTrigger>
              {/* Il tooltip sparisce appena il picker e' aperto: con il pannello
                  aperto sopra il bottone non deve comparire sopra le emoji. */}
              {!emojiOpen && <TooltipContent side="top">Inserisci emoji</TooltipContent>}
            </Tooltip>
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

      {confirmDelete && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Cancella messaggio">
          <div className="w-full max-w-sm rounded-lg border border-[var(--dash-border)] bg-[var(--dash-panel)] p-4 shadow-xl">
            <h2 className="text-sm font-semibold text-[var(--dash-text-strong)]">Cancella messaggio</h2>
            <p className="mt-2 text-xs leading-relaxed text-[var(--dash-muted)]">
              Il messaggio verrà eliminato per tutti. Vuoi continuare?
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-[var(--dash-border)] bg-[var(--dash-surface)] px-3 py-1.5 text-xs text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-surface-2)]"
              >
                <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Annulla
              </button>
              <button
                type="button"
                onClick={() => { const id = confirmDelete; setConfirmDelete(null); void deleteEntry(id); }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-[var(--dash-danger-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--dash-danger-text)] transition-colors hover:brightness-110"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Cancella
              </button>
            </div>
          </div>
        </div>
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
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-[var(--dash-border)] bg-[var(--dash-surface)] px-3 py-1.5 text-xs text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-surface-2)]"
              >
                <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
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
