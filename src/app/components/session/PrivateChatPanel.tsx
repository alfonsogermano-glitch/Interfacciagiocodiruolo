import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent } from 'react';
import { Check, FileDown, Loader2, LockKeyhole, MoreVertical, Plus, Send, Smile, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../auth/AuthContext';
import { Copy } from '../IconeCopia';
import { ImageSun } from '../IconeImmagine';
import { ChatImageAttachment } from './ChatImageAttachment';
import { FlagText } from './EmojiFlag';
import { EmojiPicker } from './EmojiPicker';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { chatImageClipboardBlob, MAX_ATTACHMENT_BYTES, readChatImageSize, saveAttachmentToDisk, uploadPrivateChatAttachment } from './chatAttachments';
import { removeContentAsset } from '../../../services/storage/contentAssets';
import { belongsToPrivateThread, clearPrivateChat, deletePrivateChatMessage, loadPrivateChatMessages, markPrivateChatSeen, PRIVATE_CHAT_PAGE_SIZE, sendPrivateChatMessage, type CampaignChatParticipant, type PrivateChatMessage } from '../../../services/supabase/privateChatService';
import type { ChatAttachment } from '../../../services/supabase/chatService';

interface Props {
  campaignId: string;
  peer: CampaignChatParticipant;
  messages: PrivateChatMessage[];
  refreshToken: number;
  canSend: boolean;
  online: boolean;
  onMessages: (messages: PrivateChatMessage[]) => void;
  onCleared?: () => void;
  onClose: () => void;
}

export function PrivateChatPanel({ campaignId, peer, messages, refreshToken, canSend, online, onMessages, onCleared, onClose }: Props) {
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasOlder, setHasOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PrivateChatMessage | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [visible, setVisible] = useState(document.visibilityState === 'visible');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const olderHeightRef = useRef<number | null>(null);
  const stickToBottom = useRef(true);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMessagesRef = useRef(onMessages);
  onMessagesRef.current = onMessages;
  const feed = messages.filter((message) => !message.deletedAt && user && belongsToPrivateThread(message, user.id, peer.id));
  // "Pulisci chat privata" spetta solo all'autore della conversazione, cioe' al
  // mittente del primo messaggio della coppia (e solo se entrambi sono ancora
  // membri: la funzione server lo verifica). L'elenco inbox del pannello
  // genitore e' completo (paginato fino in fondo), quindi il primo messaggio
  // della coppia e' sempre presente anche se non tutti i fili sono aperti.
  const canClear = useMemo(() => {
    if (!user || !canSend) return false;
    const thread = messages
      .filter((message) => belongsToPrivateThread(message, user.id, peer.id))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    return thread.length > 0 && thread[0].senderId === user.id;
  }, [messages, user?.id, peer.id, canSend]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadPrivateChatMessages(campaignId, peer.id).then((page) => {
      if (cancelled) return;
      onMessagesRef.current(page);
      setHasOlder(page.length === PRIVATE_CHAT_PAGE_SIZE);
    }).catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Impossibile caricare i messaggi privati.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [campaignId, peer.id, refreshToken]);

  useEffect(() => {
    const update = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);
  useEffect(() => {
    if (!emojiOpen) return;
    const close = (event: PointerEvent) => { if (!emojiRef.current?.contains(event.target as Node)) setEmojiOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setEmojiOpen(false); };
    document.addEventListener('pointerdown', close);
    window.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); window.removeEventListener('keydown', escape); };
  }, [emojiOpen]);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('pointerdown', close);
    window.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); window.removeEventListener('keydown', escape); };
  }, [menuOpen]);
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    if (olderHeightRef.current !== null) {
      element.scrollTop += element.scrollHeight - olderHeightRef.current;
      olderHeightRef.current = null;
    } else if (stickToBottom.current) element.scrollTop = element.scrollHeight;
  }, [feed.length, loading]);
  const latest = feed[feed.length - 1]?.createdAt;
  useEffect(() => {
    if (user && latest && visible && atBottom && !loading) markPrivateChatSeen(campaignId, user.id, peer.id, latest);
  }, [campaignId, user?.id, peer.id, latest, visible, atBottom, loading]);

  const sent = (message: PrivateChatMessage) => {
    stickToBottom.current = true;
    setAtBottom(true);
    onMessagesRef.current([message]);
  };
  const sendText = async () => {
    if (!user || busy || !canSend || !text.trim()) return;
    setBusy(true);
    try {
      sent(await sendPrivateChatMessage({ campaignId, senderId: user.id, recipientId: peer.id, content: text }));
      setText(''); setEmojiOpen(false);
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : 'Invio non riuscito.'); }
    finally { setBusy(false); }
  };
  const sendFile = async (file: File, image: boolean) => {
    if (!user || busy || !canSend) return;
    if (file.size > MAX_ATTACHMENT_BYTES) { toast.error('Il file supera la dimensione massima di 50 MB.'); return; }
    if (image && !file.type.startsWith('image/')) { toast.error('Seleziona un file immagine.'); return; }
    setBusy(true);
    let attachment: ChatAttachment | undefined;
    try {
      const dimensions = image ? await readChatImageSize(file) : undefined;
      attachment = await uploadPrivateChatAttachment({ file, campaignId, senderId: user.id, recipientId: peer.id });
      if (image) Object.assign(attachment, { display: 'image', ...dimensions });
      sent(await sendPrivateChatMessage({ campaignId, senderId: user.id, recipientId: peer.id, attachment }));
    } catch (reason) {
      if (attachment) void removeContentAsset(attachment.bucket, attachment.assetPath, 'cloud').catch(() => {});
      toast.error(reason instanceof Error ? reason.message : 'Caricamento privato non riuscito.');
    } finally { setBusy(false); }
  };
  const picked = (event: ChangeEvent<HTMLInputElement>, image: boolean) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (file) void sendFile(file, image);
  };
  const paste = (event: ClipboardEvent<HTMLInputElement>) => {
    const file = Array.from(event.clipboardData.items).find((item) => item.kind === 'file' && item.type.startsWith('image/'))?.getAsFile();
    if (file) { event.preventDefault(); void sendFile(file, true); }
  };
  const download = (attachment: ChatAttachment) => {
    void saveAttachmentToDisk(attachment).catch(() => toast.error('Impossibile scaricare l’allegato privato.'));
  };
  const copyMessage = (message: PrivateChatMessage) => {
    if (!navigator.clipboard) { toast.error('Appunti non disponibili in questo browser.'); return; }
    const image = message.attachment?.display === 'image' ? message.attachment : undefined;
    if (image && (typeof ClipboardItem === 'undefined' || !navigator.clipboard.write)) { toast.error('Copia immagini non supportata dal browser.'); return; }
    const operation = image ? navigator.clipboard.write([new ClipboardItem({ 'image/png': chatImageClipboardBlob(image) })]) : navigator.clipboard.writeText(message.content);
    void operation.then(() => {
      setCopied(message.id);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(null), 1500);
    }).catch(() => toast.error('Impossibile copiare il messaggio.'));
  };
  const remove = async () => {
    if (!deleteTarget || deleting) return;
    const target = deleteTarget;
    setDeleting(true);
    try {
      await deletePrivateChatMessage(target.id);
      onMessagesRef.current([{ ...target, content: '', attachment: undefined, deletedAt: new Date().toISOString() }]);
      if (target.attachment) void removeContentAsset(target.attachment.bucket, target.attachment.assetPath, 'cloud').catch(() => {});
      setDeleteTarget(null);
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : 'Cancellazione non riuscita.'); }
    finally { setDeleting(false); }
  };
  const clearChat = async () => {
    if (!user || clearing || !canSend || !canClear) return;
    setClearing(true);
    setConfirmClear(false);
    setMenuOpen(false);
    try {
      await clearPrivateChat(campaignId, peer.id, user.id);
      onCleared?.();
      toast.success('Chat privata pulita.');
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : 'Pulizia non riuscita.'); }
    finally { setClearing(false); }
  };

  return <div data-private-chat-panel className="flex min-h-0 flex-1 flex-col bg-[var(--dash-panel)] text-[var(--dash-text)]">
    <div className="flex shrink-0 items-center gap-2 border-b border-[var(--dash-border)] px-3 py-2">
      <LockKeyhole className="h-4 w-4 shrink-0 text-[var(--dash-accent)]" />
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">Privato · {peer.name}{peer.isGm ? ' · GM' : ''}</p><p className="text-[10px] text-[var(--dash-muted)]">Solo tu e {peer.name} · {online ? 'Online' : 'Offline'}</p></div>
      <div className="relative" ref={menuRef}>
        <button type="button" aria-label="Menu conversazione privata" title="Menu conversazione privata" onClick={() => setMenuOpen((open) => !open)} className="rounded-md p-1 hover:bg-[var(--dash-surface-2)]"><MoreVertical className="h-4 w-4" /></button>
        {menuOpen && <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-panel)] p-1 shadow-lg">
          {canClear && <button type="button" onClick={() => { setMenuOpen(false); setConfirmClear(true); }} disabled={clearing} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[var(--dash-danger-text)] hover:bg-[var(--dash-surface-2)]"><Trash2 className="h-4 w-4" />Pulisci chat privata</button>}
          <button type="button" onClick={onClose} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--dash-surface-2)]"><X className="h-4 w-4" />Torna alla campagna</button>
        </div>}
      </div>
    </div>
    <div ref={scrollRef} className="session-chat-scroll min-h-0 flex-1 space-y-2 overflow-y-auto p-3" onScroll={() => {
      const element = scrollRef.current;
      if (element) { const bottom = element.scrollHeight - element.scrollTop - element.clientHeight < 40; stickToBottom.current = bottom; setAtBottom(bottom); }
    }}>
      {hasOlder && <button type="button" disabled={loading} className="w-full rounded-md border border-[var(--dash-border)] p-1 text-xs" onClick={() => {
        const first = feed[0]; if (!first) return;
        setLoading(true);
        stickToBottom.current = false;
        setAtBottom(false);
        void loadPrivateChatMessages(campaignId, peer.id, { createdAt: first.createdAt, id: first.id }).then((page) => {
          olderHeightRef.current = scrollRef.current?.scrollHeight ?? null;
          onMessagesRef.current(page); setHasOlder(page.length === PRIVATE_CHAT_PAGE_SIZE);
        }).catch(() => toast.error('Impossibile caricare i messaggi precedenti.')).finally(() => setLoading(false));
      }}>Carica messaggi precedenti</button>}
      {loading && <p role="status" className="text-center text-xs text-[var(--dash-muted)]">Caricamento…</p>}
      {error && <p role="alert" className="text-xs text-[var(--dash-danger-text)]">{error}</p>}
      {!loading && !error && feed.length === 0 && <p className="py-6 text-center text-sm text-[var(--dash-muted)]">Nessun messaggio privato. Scrivi a {peer.name}.</p>}
      {feed.map((message) => <div key={message.id} className="group flex items-start gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--dash-border)] bg-[var(--dash-surface-2)]">{message.senderAvatarUrl ? <img src={message.senderAvatarUrl} alt="" className="h-full w-full object-cover" /> : message.senderName.slice(0, 1).toUpperCase()}</div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-[var(--dash-text-strong)]">{message.senderName}</p>
          <div className="mt-0.5">
            {message.attachment?.display === 'image' ? <ChatImageAttachment attachment={message.attachment} onDownload={() => download(message.attachment!)} />
              : message.attachment ? <button type="button" onClick={() => download(message.attachment!)} className="flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg rounded-tl-none border border-[var(--dash-border)] bg-[var(--dash-surface)] px-3 py-2 text-left text-sm"><FileDown className="h-4 w-4 shrink-0" /><span className="truncate">{message.attachment.fileName}</span></button>
              : <div className="whitespace-pre-wrap break-words rounded-lg rounded-tl-none border border-[var(--dash-border)] bg-[var(--dash-surface)] px-3 py-2 text-sm"><FlagText>{message.content}</FlagText></div>}
          </div>
          <div className="flex justify-end gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            <button type="button" aria-label={copied === message.id ? 'Copiato' : 'Copia messaggio privato'} title={copied === message.id ? 'Copiato' : 'Copia'} onClick={() => copyMessage(message)} className="rounded p-1 text-[var(--dash-muted)] hover:text-[var(--dash-accent)]">{copied === message.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}</button>
            {message.senderId === user?.id && <button type="button" aria-label="Cancella messaggio privato" title="Cancella" onClick={() => setDeleteTarget(message)} className="rounded p-1 text-[var(--dash-muted)] hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>}
          </div>
        </div>
      </div>)}
    </div>
    <form className="relative shrink-0 border-t border-[var(--dash-border)] p-3" onSubmit={(event) => { event.preventDefault(); void sendText(); }}>
      {!canSend && <p className="mb-2 text-xs text-[var(--dash-muted)]">Questo utente non partecipa più alla campagna.</p>}
      <div className="flex items-center gap-2 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface)] px-3 py-2">
        <input ref={inputRef} value={text} maxLength={20000} onChange={(event) => setText(event.target.value)} onPaste={paste} disabled={busy || !canSend} placeholder={`Messaggio privato a ${peer.name}`} aria-label={`Messaggio privato a ${peer.name}`} className="min-w-0 flex-1 bg-transparent text-sm outline-none disabled:opacity-50" />
        <Tooltip><TooltipTrigger asChild><button type="button" aria-label="Allega file privato" disabled={busy || !canSend} onClick={() => fileRef.current?.click()} className="rounded p-1"><Plus className="h-4 w-4" /></button></TooltipTrigger><TooltipContent>Allega file privato</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild><button type="button" aria-label="Invia immagine privata" disabled={busy || !canSend} onClick={() => imageRef.current?.click()} className="rounded p-1"><ImageSun className="h-4 w-4" /></button></TooltipTrigger><TooltipContent>Invia immagine privata</TooltipContent></Tooltip>
        <div ref={emojiRef}>
          <button type="button" aria-label="Inserisci emoji nel messaggio privato" disabled={busy || !canSend} onClick={() => setEmojiOpen((open) => !open)} className="rounded p-1"><Smile className="h-4 w-4" /></button>
          {emojiOpen && <div className="absolute bottom-full right-3 z-50 mb-1 w-[min(360px,calc(100%-24px))]"><EmojiPicker onPick={(char) => { setText((current) => current + char); setEmojiOpen(false); inputRef.current?.focus(); }} /></div>}
        </div>
        <button type="submit" aria-label="Invia messaggio privato" disabled={busy || !canSend || !text.trim()} className="rounded p-1 text-[var(--dash-accent)] disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button>
      </div>
      <input ref={fileRef} type="file" className="hidden" onChange={(event) => picked(event, false)} />
      <input ref={imageRef} type="file" accept="image/*" className="hidden" onChange={(event) => picked(event, true)} />
    </form>
    {deleteTarget && <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><div role="dialog" aria-modal="true" aria-label="Cancella messaggio privato" className="rounded-xl border border-[var(--dash-border)] bg-[var(--dash-panel)] p-4"><p className="mb-3 text-sm">Cancellare questo messaggio privato per entrambi?</p><div className="flex justify-end gap-2"><button type="button" disabled={deleting} onClick={() => setDeleteTarget(null)} className="inline-flex items-center gap-1 rounded border border-[var(--dash-border)] px-3 py-1 text-sm"><X className="h-4 w-4 shrink-0" aria-hidden="true" />Annulla</button><button type="button" disabled={deleting} onClick={() => void remove()} className="inline-flex items-center gap-1 rounded bg-[var(--dash-accent)] px-3 py-1 text-sm"><Trash2 className="h-4 w-4" />Cancella</button></div></div></div>}
    {confirmClear && canClear && <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><div role="dialog" aria-modal="true" aria-label="Pulisci chat privata" className="rounded-xl border border-[var(--dash-border)] bg-[var(--dash-panel)] p-4"><p className="mb-1 text-sm font-semibold">Pulisci chat privata</p><p className="mb-3 text-xs text-[var(--dash-muted)]">Verranno eliminati definitivamente tutti i messaggi e i file condivisi con {peer.name}, per entrambi.</p><div className="flex justify-end gap-2"><button type="button" disabled={clearing} onClick={() => setConfirmClear(false)} className="inline-flex items-center gap-1 rounded border border-[var(--dash-border)] px-3 py-1 text-sm"><X className="h-4 w-4 shrink-0" aria-hidden="true" />Annulla</button><button type="button" disabled={clearing} onClick={() => void clearChat()} className="inline-flex items-center gap-1 rounded bg-[var(--dash-accent)] px-3 py-1 text-sm"><Trash2 className="h-4 w-4" />Pulisci</button></div></div></div>}
  </div>;
}
