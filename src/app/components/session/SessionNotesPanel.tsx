import { useEffect, useRef, useState, useCallback } from 'react';
import { User, Ghost, Skull, BookOpen, Plus, Trash2, Loader2, StickyNote } from 'lucide-react';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { loadCharacters, loadCharactersViaServer } from '../../../services/supabase/charactersService';
import { loadNPCs, loadMonsters } from '../../../services/supabase/entitiesService';
import { useAuth, supabase } from '../../auth/AuthContext';
import { useCampaign } from '../../campaigns/CampaignContext';
import { CampaignNotesPanel } from './shared/CampaignNotesPanel';

const SERVER_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-771c5bfd`;

type EntityKind = 'character' | 'npc' | 'monster' | 'campaign';
interface EntityOption {
  kind: EntityKind;
  id: string;
  name: string;
  ownerProfileId?: string;
}
interface NoteTab {
  id: string;
  tab_name: string;
  content: string;
  updated_at: string;
}

export function SessionNotesPanel() {
  const { user, session } = useAuth();
  const { activeCampaignId, activeCampaign, updateCampaign } = useCampaign();

  const [characters, setCharacters] = useState<any[]>([]);
  const [npcs, setNpcs] = useState<any[]>([]);
  const [monsters, setMonsters] = useState<any[]>([]);
  const [isLoadingEntities, setIsLoadingEntities] = useState(true);
  const [selectedEntity, setSelectedEntity] = useState<EntityOption | null>(null);

  const [notes, setNotes] = useState<NoteTab[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);
  const [newTabDraft, setNewTabDraft] = useState<string | null>(null);

  const isOwner = activeCampaign?.ownerId === user?.id;
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadSeqRef = useRef(0);

  useEffect(() => {
    const loadEntities = async () => {
      setIsLoadingEntities(true);
      try {
        const [loadedChars, loadedNpcs, loadedMonsters] = await Promise.all([
          session?.access_token
            ? loadCharactersViaServer(activeCampaignId, SERVER_BASE, session.access_token)
            : loadCharacters(activeCampaignId),
          loadNPCs(activeCampaignId),
          loadMonsters(activeCampaignId),
        ]);
        setCharacters(loadedChars);
        setNpcs(loadedNpcs);
        setMonsters(loadedMonsters);
      } catch (err) {
        console.error('Errore caricamento entità per note:', err);
      } finally {
        setIsLoadingEntities(false);
      }
    };
    if (activeCampaignId) loadEntities();
  }, [activeCampaignId, session?.access_token]);

  const canEditEntity = (kind: EntityKind, ownerProfileId?: string) => {
    if (isOwner) return true;
    return kind === 'character' && ownerProfileId === user?.id;
  };

  const canViewEntity = (kind: EntityKind, ownerProfileId?: string) => {
    if (kind !== 'character') return isOwner; // PNG/Mostro: solo GM vede le note
    return isOwner || ownerProfileId === user?.id;
  };

  const loadNotesFor = useCallback(async (entity: EntityOption) => {
    const mySeq = ++loadSeqRef.current;
    setIsLoadingNotes(true);
    try {
      const accessToken = session?.access_token ?? publicAnonKey;
      const res = await fetch(
        `${SERVER_BASE}/campaigns/${activeCampaignId}/notes?entityType=${entity.kind}&entityId=${entity.id}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const data = await res.json();
      if (loadSeqRef.current !== mySeq) return;
      if (!res.ok) throw new Error(data.error ?? 'Errore caricamento note');
      const list = data.notes ?? [];
      setNotes(list);
      setSelectedNoteId(list[0]?.id ?? null);
    } catch (err) {
      console.error('Errore caricamento note:', err);
      setNotes([]);
      setSelectedNoteId(null);
    } finally {
      if (loadSeqRef.current === mySeq) setIsLoadingNotes(false);
    }
  }, [activeCampaignId, session?.access_token]);

  useEffect(() => {
    // Le note di campagna sono gestite a parte da CampaignNotesPanel (via
    // useEntityTabs, con proprio fetch/sync), niente da caricare qui.
    if (!selectedEntity || selectedEntity.kind === 'campaign') return;
    loadNotesFor(selectedEntity);
  }, [selectedEntity, loadNotesFor]);

  // Sincronizzazione in tempo reale: un annuncio leggero fa ricaricare le
  // note a chiunque stia guardando la stessa entità in quel momento
  useEffect(() => {
    if (!activeCampaignId) return;
    const ch = supabase
      .channel(`campaign:${activeCampaignId}`, { config: { private: true } })
      .on('broadcast', { event: 'notes_change' }, (msg: any) => {
        const payload = msg?.payload ?? {};
        if (selectedEntity && payload.entityType === selectedEntity.kind && payload.entityId === selectedEntity.id) {
          loadNotesFor(selectedEntity);
        }
      })
      .subscribe();
    return () => { try { supabase.removeChannel(ch); } catch {} };
  }, [activeCampaignId, selectedEntity, loadNotesFor]);

  const announceChange = async () => {
    if (!selectedEntity) return;
    try {
      const ch = supabase.channel(`campaign:${activeCampaignId}`, { config: { private: true } });
      await new Promise<void>((resolve) => {
        let settled = false;
        const done = () => { if (!settled) { settled = true; supabase.removeChannel(ch); resolve(); } };
        setTimeout(done, 2000);
        ch.subscribe(async (status) => {
          if (status === 'SUBSCRIBED' && !settled) {
            await ch.send({ type: 'broadcast', event: 'notes_change', payload: { entityType: selectedEntity.kind, entityId: selectedEntity.id } });
            settled = true;
            supabase.removeChannel(ch);
            resolve();
          }
        });
      });
    } catch (err) {
      console.error('Errore annuncio modifica note:', err);
    }
  };

  const handleCreateTab = async () => {
    if (!selectedEntity || !newTabDraft?.trim()) return;
    try {
      const accessToken = session?.access_token ?? '';
      const res = await fetch(`${SERVER_BASE}/campaigns/${activeCampaignId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ entityType: selectedEntity.kind, entityId: selectedEntity.id, tabName: newTabDraft.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNotes(prev => [...prev, data.note]);
      setSelectedNoteId(data.note.id);
      setNewTabDraft(null);
      void announceChange();
    } catch (err) {
      console.error('Errore creazione tab nota:', err);
    }
  };

  const handleDeleteTab = async (noteId: string) => {
    if (!window.confirm('Eliminare questa tab di note?')) return;
    try {
      const accessToken = session?.access_token ?? '';
      await fetch(`${SERVER_BASE}/notes/${noteId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setNotes(prev => prev.filter(n => n.id !== noteId));
      setSelectedNoteId(prev => (prev === noteId ? null : prev));
      void announceChange();
    } catch (err) {
      console.error('Errore eliminazione tab nota:', err);
    }
  };

  const handleContentChange = (noteId: string, content: string) => {
    setNotes(prev => prev.map(n => (n.id === noteId ? { ...n, content } : n)));
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const accessToken = session?.access_token ?? '';
        await fetch(`${SERVER_BASE}/notes/${noteId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ content }),
        });
        void announceChange();
      } catch (err) {
        console.error('Errore salvataggio nota:', err);
      }
    }, 400);
  };

  const entityOptions: EntityOption[] = [
    { kind: 'campaign' as const, id: activeCampaignId, name: 'Note di campagna' },
    ...characters.filter(c => canViewEntity('character', (c as any).ownerProfileId)).map(c => ({ kind: 'character' as const, id: c.id, name: c.name, ownerProfileId: (c as any).ownerProfileId })),
    ...(isOwner ? npcs.map(n => ({ kind: 'npc' as const, id: n.id, name: n.name })) : []),
    ...(isOwner ? monsters.map(m => ({ kind: 'monster' as const, id: m.id, name: m.name })) : []),
  ];

  const selectedNote = notes.find(n => n.id === selectedNoteId) ?? null;
  const canEditSelected = selectedEntity ? canEditEntity(selectedEntity.kind, selectedEntity.ownerProfileId) : false;

  if (isLoadingEntities) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--dash-muted)]" /></div>;
  }

  return (
    <div className="flex h-full select-none">
      <div className="w-64 shrink-0 overflow-y-auto border-r border-[var(--dash-border-soft)] py-3">
        {entityOptions.length === 0 ? (
          <div className="px-4 py-2 text-xs text-[var(--dash-muted)]">Nessuna scheda disponibile.</div>
        ) : (
          <div className="space-y-1 px-2">
            {entityOptions.map((entity) => (
              <button
                key={`${entity.kind}-${entity.id}`}
                type="button"
                onClick={() => setSelectedEntity(entity)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  selectedEntity?.kind === entity.kind && selectedEntity.id === entity.id
                    ? 'bg-[var(--dash-surface-2)] text-[var(--dash-text-strong)]'
                    : 'text-[var(--dash-text)] hover:bg-[var(--dash-surface-2)]/50'
                }`}
              >
                {entity.kind === 'campaign' ? <BookOpen className="h-4 w-4 shrink-0" /> : entity.kind === 'npc' ? <Ghost className="h-4 w-4 shrink-0" /> : entity.kind === 'monster' ? <Skull className="h-4 w-4 shrink-0" /> : <User className="h-4 w-4 shrink-0" />}
                <span className="truncate">{entity.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        {!selectedEntity ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--dash-muted)]">
            Seleziona una scheda per vedere le sue note
          </div>
        ) : selectedEntity.kind === 'campaign' ? (
          <div className="flex-1 overflow-auto p-4">
            <CampaignNotesPanel
              campaignId={selectedEntity.id}
              accessToken={session?.access_token}
              canEdit={isOwner}
              savedTabOrder={activeCampaign?.tabOrder}
              onPersistTabOrder={(order) => updateCampaign(selectedEntity.id, { tabOrder: order })}
            />
          </div>
        ) : (
          <>
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--dash-border-soft)] px-4 py-3">
              {isLoadingNotes ? (
                <Loader2 className="h-4 w-4 animate-spin text-[var(--dash-muted)]" />
              ) : (
                <>
                  {notes.map((note) => (
                    <div key={note.id} className="group relative">
                      <button
                        type="button"
                        onClick={() => setSelectedNoteId(note.id)}
                        className={`rounded-md px-3 py-1.5 pr-6 text-sm transition-colors ${
                          selectedNoteId === note.id
                            ? 'border border-[var(--dash-accent)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)]'
                            : 'border border-transparent bg-[var(--dash-panel)] text-[var(--dash-text)] hover:bg-[var(--dash-surface-2)]'
                        }`}
                      >
                        {note.tab_name}
                      </button>
                      {canEditSelected && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleDeleteTab(note.id); }}
                          className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <Trash2 className="h-3 w-3 text-[var(--dash-danger-text)]" />
                        </button>
                      )}
                    </div>
                  ))}
                  {canEditSelected && (
                    newTabDraft !== null ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          autoFocus
                          value={newTabDraft}
                          onChange={(e) => setNewTabDraft(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleCreateTab(); if (e.key === 'Escape') setNewTabDraft(null); }}
                          placeholder="Nome tab..."
                          className="w-32 rounded-md border border-[var(--dash-border)] bg-[var(--dash-input)] px-2 py-1 text-sm text-[var(--dash-text)]"
                        />
                        <button type="button" onClick={handleCreateTab} className="rounded-md bg-[var(--dash-accent)] px-2 py-1 text-xs text-[var(--dash-text-strong)]">OK</button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setNewTabDraft('')}
                        className="flex items-center gap-1 rounded-md border border-dashed border-[var(--dash-border-soft)] px-2 py-1.5 text-xs text-[var(--dash-muted)] hover:border-[var(--dash-accent)] hover:text-[var(--dash-text)]"
                      >
                        <Plus className="h-3.5 w-3.5" /> Nuova tab
                      </button>
                    )
                  )}
                </>
              )}
            </div>

            <div className="flex-1 overflow-hidden p-4">
              {!selectedNote ? (
                <div className="flex h-full items-center justify-center text-sm text-[var(--dash-muted)]">
                  <div className="text-center">
                    <StickyNote className="mx-auto mb-2 h-8 w-8 text-[var(--dash-border-soft)]" />
                    Nessuna tab di note. {canEditSelected && 'Creane una per iniziare.'}
                  </div>
                </div>
              ) : (
                <textarea
                  value={selectedNote.content}
                  onChange={(e) => handleContentChange(selectedNote.id, e.target.value)}
                  disabled={!canEditSelected}
                  placeholder="Scrivi qui i tuoi appunti..."
                  className="h-full w-full resize-none rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4 text-sm text-[var(--dash-text)] outline-none focus:border-[var(--dash-accent)] disabled:cursor-not-allowed disabled:opacity-70"
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
