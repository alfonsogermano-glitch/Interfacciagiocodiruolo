import { useCallback, useEffect, useMemo, useState } from 'react';
import { LockKeyhole, MessageSquare } from 'lucide-react';
import { useCampaign } from '../../campaigns/CampaignContext';
import { useAuth } from '../../auth/AuthContext';
import { useCampaignChannel } from '../../../services/realtime/campaignChannel';
import { onlineCampaignParticipants } from '../../../services/realtime/campaignPresence';
import { selectedContentMode } from '../../../services/storage/persistenceMode';
import { isPrivateChatUnread, loadPrivateChatInbox, loadPrivateChatParticipants, mergePrivateMessages, privateChatPeer, subscribePrivateChat, type CampaignChatParticipant, type PrivateChatMessage } from '../../../services/supabase/privateChatService';
import type { ChatMessage } from '../../../services/supabase/chatService';
import { SessionChatPanel } from './SessionChatPanel';
import { PrivateChatPanel } from './PrivateChatPanel';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

export function CampaignChatPanel({ incomingMessage, onPrivateConversationChange }: { incomingMessage: ChatMessage | null; onPrivateConversationChange: (privateOpen: boolean) => void }) {
  const { activeCampaign } = useCampaign();
  const { user } = useAuth();
  return activeCampaign && user ? <CampaignChatContent key={`${activeCampaign.id}:${user.id}`} campaignId={activeCampaign.id} incomingMessage={incomingMessage?.campaignId === activeCampaign.id ? incomingMessage : null} onPrivateConversationChange={onPrivateConversationChange} /> : null;
}

function CampaignChatContent({ campaignId, incomingMessage, onPrivateConversationChange }: { campaignId: string; incomingMessage: ChatMessage | null; onPrivateConversationChange: (privateOpen: boolean) => void }) {
  const { user } = useAuth();
  const cloud = selectedContentMode() === 'cloud';
  const [participants, setParticipants] = useState<CampaignChatParticipant[]>([]);
  const [presence, setPresence] = useState<Record<string, unknown>>({});
  const [messages, setMessages] = useState<PrivateChatMessage[]>([]);
  const [peer, setPeer] = useState<CampaignChatParticipant | null>(null);
  const [revision, setRevision] = useState(0);
  const [, setSeenRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [liveReady, setLiveReady] = useState(false);
  const [loadingDirectory, setLoadingDirectory] = useState(cloud);
  const merge = useCallback((incoming: PrivateChatMessage[]) => setMessages((current) => mergePrivateMessages(current, incoming)), []);
  useCampaignChannel(campaignId, {
    onPresenceSync: setPresence,
    onBroadcast: { members_change: () => setRevision((value) => value + 1) },
  });
  useEffect(() => {
    onPrivateConversationChange(peer !== null);
  }, [peer?.id, onPrivateConversationChange]);
  useEffect(() => () => onPrivateConversationChange(false), [onPrivateConversationChange]);

  useEffect(() => {
    if (!cloud || !user) return;
    return subscribePrivateChat(campaignId, user.id, (message) => merge([message]), (ready) => {
      setLiveReady(ready);
      if (ready) setRevision((value) => value + 1);
    });
  }, [campaignId, user?.id, cloud, merge]);
  useEffect(() => {
    if (!cloud || !user) return;
    let cancelled = false;
    setLoadingDirectory(true);
    void Promise.all([loadPrivateChatParticipants(campaignId), loadPrivateChatInbox(campaignId)]).then(([people, inbox]) => {
      if (cancelled) return;
      setParticipants(people);
      if (!people.some((participant) => participant.id === user.id)) { setMessages([]); setPeer(null); }
      else merge(inbox);
      setError(null);
    }).catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Chat privata non disponibile.'); })
      .finally(() => { if (!cancelled) setLoadingDirectory(false); });
    return () => { cancelled = true; };
  }, [campaignId, user?.id, cloud, revision, merge]);
  useEffect(() => {
    const seen = () => setSeenRevision((value) => value + 1);
    const focus = () => { if (document.visibilityState === 'visible') setRevision((value) => value + 1); };
    window.addEventListener('hollowgate:private-chat-seen', seen);
    window.addEventListener('storage', seen);
    document.addEventListener('visibilitychange', focus);
    return () => { window.removeEventListener('hollowgate:private-chat-seen', seen); window.removeEventListener('storage', seen); document.removeEventListener('visibilitychange', focus); };
  }, []);

  const online = useMemo(() => onlineCampaignParticipants(participants, presence), [participants, presence]);
  const threads = new Map<string, CampaignChatParticipant>();
  const unread = new Map<string, number>();
  if (user) {
    for (const message of messages) {
      if (message.deletedAt) continue;
      const other = privateChatPeer(message, user.id);
      threads.set(other.id, participants.find((participant) => participant.id === other.id) ?? other);
      if (isPrivateChatUnread(message, user.id)) unread.set(other.id, (unread.get(other.id) ?? 0) + 1);
    }
  }
  const currentPeer = peer ? participants.find((participant) => participant.id === peer.id) ?? peer : null;
  return <div className="relative flex h-full min-h-0 flex-col bg-[var(--dash-panel)] text-[var(--dash-text)]">
    <div data-campaign-online-portraits className="shrink-0 border-b border-[var(--dash-border)] px-3 py-2">
      <div className="mb-1 flex items-center justify-between text-[10px] text-[var(--dash-muted)]"><span>Online nella campagna · {online.length}</span>{cloud && !liveReady && !error && <span>Connessione…</span>}</div>
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {online.map((participant) => <Tooltip key={participant.id}><TooltipTrigger asChild>
          <button type="button" disabled={participant.id === user?.id} onClick={() => setPeer(participant)} aria-label={`Messaggio privato a ${participant.name}${participant.isGm ? ', Game Master' : ''}`} className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 p-0.5 ${peer?.id === participant.id ? 'border-[var(--dash-accent)]' : 'border-[var(--dash-border)] hover:border-[var(--dash-accent)]'}`}>
            {participant.avatarUrl ? <img src={participant.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" /> : <span className="text-sm font-semibold">{participant.name.slice(0, 1).toUpperCase()}</span>}
            <span className="absolute -bottom-0.5 right-0 h-2.5 w-2.5 rounded-full border-2 border-[var(--dash-panel)] bg-emerald-400" />
            {!!unread.get(participant.id) && <span className="absolute -right-1 -top-1 rounded-full bg-[var(--dash-accent)] px-1 text-[9px]">{unread.get(participant.id)}</span>}
          </button>
        </TooltipTrigger><TooltipContent>{participant.name}{participant.id === user?.id ? ' · Tu' : ''}{participant.isGm ? ' · GM' : ''}</TooltipContent></Tooltip>)}
        {online.length === 0 && <span className="py-1 text-xs text-[var(--dash-muted)]">{cloud ? loadingDirectory ? 'Caricamento partecipanti…' : 'Nessun partecipante online confermato.' : 'Presenza e messaggi privati disponibili nelle campagne Cloud.'}</span>}
      </div>
      {error && <div role="alert" className="mt-1 text-xs text-[var(--dash-muted)]">{error}<button type="button" onClick={() => setRevision((value) => value + 1)} className="ml-2 underline">Riprova</button></div>}
      <div className="mt-1 flex items-center gap-1 overflow-x-auto pb-1">
        <button type="button" onClick={() => setPeer(null)} aria-pressed={!peer} className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs ${!peer ? 'bg-[var(--dash-surface-2)] text-[var(--dash-accent)]' : 'text-[var(--dash-muted)]'}`}><MessageSquare className="h-3.5 w-3.5" />Campagna</button>
        {[...threads.values()].reverse().map((other) => <button type="button" key={other.id} onClick={() => setPeer(other)} aria-pressed={peer?.id === other.id} className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs ${peer?.id === other.id ? 'bg-[var(--dash-surface-2)] text-[var(--dash-accent)]' : 'text-[var(--dash-muted)]'}`}><LockKeyhole className="h-3 w-3" /><span className="max-w-28 truncate">{other.name}</span>{!!unread.get(other.id) && <span className="rounded-full bg-[var(--dash-accent)] px-1 text-[9px] text-[var(--dash-text-strong)]">{unread.get(other.id)}</span>}</button>)}
      </div>
    </div>
    {currentPeer && cloud ? <PrivateChatPanel key={currentPeer.id} campaignId={campaignId} peer={currentPeer} messages={messages} refreshToken={revision} canSend={participants.some((participant) => participant.id === currentPeer.id)} online={online.some((participant) => participant.id === currentPeer.id)} onMessages={merge} onClose={() => setPeer(null)} />
      : <div className="min-h-0 flex-1"><SessionChatPanel incomingMessage={incomingMessage} /></div>}
  </div>;
}
