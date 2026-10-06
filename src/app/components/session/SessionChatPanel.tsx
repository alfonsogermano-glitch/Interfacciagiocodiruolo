import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, Plus, Smile, Image as ImageIcon, MoreVertical, Trash2 } from 'lucide-react';
import { useDiceSession } from './dice/DiceSessionContext';
import { DiceRollHistoryCard } from './dice/DiceRollHistoryCard';
import type { RollResult } from './dice/diceTypes';
import { useAuth } from '../../auth/AuthContext';
import { useCampaign } from '../../campaigns/CampaignContext';
import { useCampaignChannel } from '../../../services/realtime/campaignChannel';
import {
  loadChatMessages,
  sendChatMessage,
  clearChatMessages,
  writeChatLastSeen,
  type ChatMessage,
} from '../../../services/supabase/chatService';

type ChatTab = 'all' | 'chat' | 'rolls' | 'files';

/** Voce della timeline unificata: messaggio di testo o tiro. */
type TimelineItem =
  | { key: string; time: number; kind: 'message'; message: ChatMessage }
  | { key: string; time: number; kind: 'roll'; roll: RollResult };

const TABS: { id: ChatTab; label: string }[] = [
  { id: 'all', label: 'Tutti' },
  { id: 'chat', label: 'Chat' },
  { id: 'rolls', label: 'Tiri' },
  { id: 'files', label: 'File' },
];

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
  const chatChannel = useCampaignChannel(activeCampaign?.id);

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
        items.push({ key: entry.id, time, kind: 'roll', roll: entry.roll });
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
    const saved = await sendChatMessage({
      campaignId: activeCampaign.id,
      senderId: user.id,
      senderName: user.displayName,
      senderAvatarUrl: user.avatarUrl,
      content: text,
    });
    if (saved) {
      console.log(`[chatService] Messaggio salvato: ${saved.id}`);
      setEntries((prev) => [...prev, saved]);
      setMessage('');
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
            {visibleItems.map((item) => item.kind === 'message' ? (
              <div key={item.key} className="flex items-start gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--dash-border)] bg-[var(--dash-surface-2)]">
                  {item.message.senderAvatarUrl
                    ? <img src={item.message.senderAvatarUrl} alt="" className="h-full w-full object-cover" />
                    : <span className="text-xs font-semibold text-[var(--dash-text)]">{item.message.senderName.slice(0, 1).toUpperCase()}</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-[var(--dash-text-strong)]">{item.message.senderName}</div>
                  <div className="mt-0.5 rounded-lg rounded-tl-none border border-[var(--dash-border)] bg-[var(--dash-surface)] px-3 py-2 text-sm text-[var(--dash-text)]">
                    {item.message.content}
                  </div>
                </div>
              </div>
            ) : (
              <DiceRollHistoryCard
                key={item.key}
                result={item.roll}
                onReroll={() => { rerollResult(item.roll); }}
                variant="chat"
              />
            ))}
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-[var(--dash-border)] p-3">
        <div className="flex items-center gap-2 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface)] px-3 py-2">
          <input
            type="text"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') handleSend(); }}
            placeholder="Scrivi qualcosa..."
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--dash-text)] outline-none placeholder:text-[var(--dash-muted)]"
          />
          <button type="button" aria-label="Allega" className="rounded-md p-1 text-[var(--dash-muted)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)]">
            <Plus className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Immagine" className="rounded-md p-1 text-[var(--dash-muted)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)]">
            <ImageIcon className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Emoji" className="rounded-md p-1 text-[var(--dash-muted)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)]">
            <Smile className="h-4 w-4" />
          </button>
        </div>
      </div>

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
