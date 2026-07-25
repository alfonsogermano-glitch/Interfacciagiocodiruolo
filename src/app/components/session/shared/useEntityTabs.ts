import { useEffect, useRef, useState } from 'react';
import { projectId } from '/utils/supabase/info';
import { useCampaignChannel } from '../../../../services/realtime/campaignChannel';

const SERVER_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-771c5bfd`;

const DRAG_THRESHOLD_PX = 6;

export type EntityTabsEntityType = 'character' | 'npc' | 'monster' | 'campaign';

export interface EntityBaseTab {
  id: string;
  label: string;
}

export interface EntityCustomTab {
  id: string;
  tab_name: string;
  content: string;
  position: number;
  hidden: boolean;
  folder_id: string | null;
}

export interface EntityOrderedTab {
  id: string;
  label: string;
  isCustom: boolean;
  hidden: boolean;
}

export interface UseEntityTabsParams {
  entityType: EntityTabsEntityType;
  entityId: string | null | undefined;
  campaignId: string | null | undefined;
  accessToken: string | null | undefined;
  canEdit: boolean;
  baseTabs: EntityBaseTab[];
  savedTabOrder: string[] | undefined;
  onPersistTabOrder: (order: string[]) => void;
}

export function useEntityTabs({
  entityType,
  entityId,
  campaignId,
  accessToken,
  canEdit,
  baseTabs,
  savedTabOrder,
  onPersistTabOrder,
}: UseEntityTabsParams) {
  const baseTabIds = baseTabs.map(t => t.id);
  const defaultTabId = baseTabIds[0] ?? '';

  // Mostri usano '' (non null) come convenzione per "nessuna campagna" (a
  // differenza di PG/PNG) - normalizzato qui solo per costruire l'URL delle
  // note, cosi' entrambi finiscono su .../campaigns/null/notes, che il
  // server gestisce correttamente (la stringa vuota produce invece
  // .../campaigns//notes, doppio slash che non instrada e torna 404).
  // Non cambia la convenzione di Monster altrove: solo qui, prima della fetch.
  const notesCampaignId = campaignId === '' ? null : campaignId;

  // TEMP DEBUG - rimuovere dopo la diagnosi: id univoco per istanza del hook,
  // per distinguere due mount separati (es. CampaignHome.tsx + SessionNotesPanel.tsx)
  // da una singola istanza che cresce nel tempo.
  const debugInstanceIdRef = useRef(Math.random().toString(36).slice(2, 8));

  const [customTabs, setCustomTabs] = useState<EntityCustomTab[]>([]);
  const [tabOrder, setTabOrder] = useState<string[]>(baseTabIds);
  const [currentTab, setCurrentTab] = useState<string>(defaultTabId);
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [openMenuTabId, setOpenMenuTabId] = useState<string | null>(null);
  const [confirmDeleteTabId, setConfirmDeleteTabId] = useState<string | null>(null);
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | 'END' | null>(null);
  const tabsContainerRef = useRef<HTMLDivElement | null>(null);
  const dragOverIdRef = useRef<string | 'END' | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number; tabId: string } | null>(null);
  const customTabSaveTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const recentLocalEditRef = useRef<Record<string, number>>({});

  // Estratto dall'effect sotto perche' serve anche a reloadCustomTabs (Note
  // del GM/Campagna, vedi CampaignNotesPanel.tsx): cancellare una cartella
  // con "elimina anche il contenuto" cancella piu' note in un colpo solo
  // lato server (DELETE /folders/:id/cascade) - un reload completo e' piu'
  // semplice e sicuro che affidarsi ai soli broadcast realtime riga-per-riga
  // per convergere, stesso principio gia' seguito da reloadFolders in
  // useFolderSection.tsx per lo stesso tipo di bug (bug realtime 2026-07-23).
  const fetchCustomTabsData = async (): Promise<EntityCustomTab[] | null> => {
    try {
      const res = await fetch(
        `${SERVER_BASE}/campaigns/${notesCampaignId}/notes?entityType=${entityType}&entityId=${entityId}`,
        { headers: { Authorization: `Bearer ${accessToken ?? ''}` } }
      );
      const data = await res.json();
      if (!res.ok) return null;
      return (data.notes ?? [])
        .map((n: any) => ({ ...n, hidden: n.hidden ?? false, folder_id: n.folder_id ?? null }))
        .sort((a: any, b: any) => a.position - b.position);
    } catch (err) {
      console.error('Errore caricamento tab personalizzate:', err);
      return null;
    }
  };

  // Fetch delle note (tab personalizzate) dell'entità selezionata
  useEffect(() => {
    if (!entityId) {
      setCustomTabs([]);
      return;
    }
    let cancelled = false;
    fetchCustomTabsData().then((sorted) => {
      if (!cancelled && sorted) setCustomTabs(sorted);
    });
    return () => { cancelled = true; };
  }, [entityId, campaignId, accessToken, entityType]);

  const reloadCustomTabs = async () => {
    const sorted = await fetchCustomTabsData();
    if (sorted) setCustomTabs(sorted);
  };

  // Realtime: propaga creazione/modifica/eliminazione di tab fatte da altri
  // client (es. il GM) verso chiunque stia guardando la stessa entità.
  // Canale campaign:{campaignId} condiviso (src/services/realtime/campaignChannel.ts,
  // vedi il commento gemello in CampaignHome.tsx per il perché) - filtra qui
  // per tabella e per entity_type/entity_id, esattamente come prima.
  const matchesThisEntity = (record: any) =>
    !!record && record.entity_type === entityType && record.entity_id === entityId;

  const handleEntityNotesBroadcast = (msg: any) => {
    const data = msg?.payload ?? {};
    if (data.table !== 'entity_notes') return;

    if (data.operation === 'DELETE') {
      if (!matchesThisEntity(data.old_record)) return;
      const deletedId = data.old_record?.id;
      if (!deletedId) return;
      setCustomTabs(prev => prev.filter(t => t.id !== deletedId));
      return;
    }

    const row = data.record;
    if (!matchesThisEntity(row)) return;
    const lastLocalEdit = recentLocalEditRef.current[row.id];
    const suppressed = !!(lastLocalEdit && Date.now() - lastLocalEdit < 1200);
    // TEMP DEBUG - rimuovere dopo la diagnosi
    console.log('[TEMP broadcast]', 'instance=', debugInstanceIdRef.current, 'entityType=', entityType, 'op=', data.operation, 'row.id=', row.id, 'row.hidden=', row.hidden, 'row.folder_id=', row.folder_id, 'suppressed(recentLocalEdit)=', suppressed);
    if (suppressed) return;

    const mapped: EntityCustomTab = { ...row, hidden: row.hidden ?? false, folder_id: row.folder_id ?? null };
    setCustomTabs(prev => {
      const exists = prev.some(t => t.id === mapped.id);
      // TEMP DEBUG - rimuovere dopo la diagnosi
      console.log('[TEMP broadcast apply]', 'instance=', debugInstanceIdRef.current, 'exists=', exists, 'prev.length=', prev.length, 'ids=', prev.map(t => t.id));
      return exists ? prev.map(t => (t.id === mapped.id ? mapped : t)) : [...prev, mapped];
    });
  };

  useCampaignChannel(entityId ? campaignId : null, {
    onBroadcast: {
      INSERT: handleEntityNotesBroadcast,
      UPDATE: handleEntityNotesBroadcast,
      DELETE: handleEntityNotesBroadcast,
    },
  });

  // Riconcilia tabOrder ogni volta che cambiano entità o tab custom:
  // parte dall'ordine salvato (o da quello base), scarta id non più esistenti,
  // accoda le tab nuove non ancora presenti nell'ordine.
  useEffect(() => {
    const validIds = new Set([...baseTabIds, ...customTabs.map(t => t.id)]);
    const saved: string[] = savedTabOrder?.length ? savedTabOrder : baseTabIds;
    const kept = saved.filter((id: string) => validIds.has(id));
    const missing = [...validIds].filter(id => !kept.includes(id));
    setTabOrder([...kept, ...missing]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId, customTabs]);

  // Chiude il menu ⋮ della tab al click fuori
  useEffect(() => {
    if (!openMenuTabId) return;
    const close = () => setOpenMenuTabId(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [openMenuTabId]);

  const persistTabOrder = (order: string[]) => {
    onPersistTabOrder(order);
  };

  const handlePointerDownTab = (e: React.PointerEvent, tabId: string) => {
    if (!canEdit || renamingTabId === tabId) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-no-drag]') || target.closest('input')) return;
    // Non avviamo subito il drag: memorizziamo solo il punto di partenza.
    // Se il mouse non si muove abbastanza prima del rilascio, sarà un click normale.
    pointerStartRef.current = { x: e.clientX, y: e.clientY, tabId };
  };

  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      if (draggedTabId) {
        const container = tabsContainerRef.current;
        if (!container) return;
        // Esclude nessuna tab dal calcolo: il conteggio è simmetrico a sinistra e a destra.
        const tabEls = Array.from(
          container.querySelectorAll<HTMLElement>('[data-tab-id]'),
        );

        let target: string | 'END' = 'END';
        for (const el of tabEls) {
          const rect = el.getBoundingClientRect();
          const mid = rect.left + rect.width / 2;
          if (e.clientX < mid) {
            target = el.dataset.tabId as string;
            break;
          }
        }
        dragOverIdRef.current = target;
        setDragOverId(target);
        return;
      }

      // Nessun drag attivo: controlla se abbiamo superato la soglia per avviarlo
      const start = pointerStartRef.current;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD_PX) {
        setDraggedTabId(start.tabId);
      }
    };

    const handleUp = () => {
      if (draggedTabId) {
        const finalTarget = dragOverIdRef.current;
        setTabOrder(prev => {
          if (finalTarget === draggedTabId) return prev; // resta ferma, nessun riordino
          const next = prev.filter(id => id !== draggedTabId);
          if (finalTarget === 'END' || finalTarget === null) {
            next.push(draggedTabId);
          } else {
            const idx = next.indexOf(finalTarget);
            next.splice(idx === -1 ? next.length : idx, 0, draggedTabId);
          }
          persistTabOrder(next);
          return next;
        });
        setDraggedTabId(null);
        setDragOverId(null);
        dragOverIdRef.current = null;
      }
      // Se non era mai partito il drag, non facciamo nulla: il click sulla tab
      // ha già funzionato normalmente tramite il suo onClick.
      pointerStartRef.current = null;
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggedTabId]);

  // tabName/opts opzionali (Note del GM/Campagna, vedi CampaignNotesPanel.tsx):
  // assenti = comportamento invariato per PG/PNG/Mostro, sempre 'Nuova tab'
  // senza hidden/folderId espliciti (default server, vedi index.tsx).
  const handleAddCustomTab = async (tabName = 'Nuova tab', opts?: { hidden?: boolean; folderId?: string | null }) => {
    if (!entityId) return;
    try {
      const res = await fetch(`${SERVER_BASE}/campaigns/${notesCampaignId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken ?? ''}` },
        body: JSON.stringify({ entityType, entityId, tabName, hidden: opts?.hidden, folderId: opts?.folderId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      recentLocalEditRef.current[data.note.id] = Date.now();
      setCustomTabs(prev => [...prev, { ...data.note, hidden: data.note.hidden ?? false, folder_id: data.note.folder_id ?? null }]);
      setCurrentTab(data.note.id);
      // Entra subito in rinomina: il "+" crea e si passa direttamente al nome
      setRenamingTabId(data.note.id);
      setRenameDraft(tabName);
    } catch (err) {
      console.error('Errore creazione tab:', err);
    }
  };

  // Duplica una singola tab (a differenza di duplicateEntityNotes in
  // entityNotesService.ts, che duplica TUTTE le tab di un'entita' verso
  // un'altra - qui invece e' la stessa entita', una tab sola, dal menu ⋮ di
  // EntityTabBar.tsx). Stesso pattern a due chiamate (POST poi PUT: la
  // posizione la calcola il server contando le righe esistenti al momento
  // della POST, quindi il contenuto va scritto dopo, in un secondo passo).
  const handleDuplicateCustomTab = async (tabId: string) => {
    const source = customTabs.find(t => t.id === tabId);
    if (!entityId || !source) return;
    try {
      const createRes = await fetch(`${SERVER_BASE}/campaigns/${notesCampaignId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken ?? ''}` },
        body: JSON.stringify({
          entityType, entityId, tabName: `${source.tab_name} (copia)`,
          hidden: source.hidden, folderId: source.folder_id,
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData.error);

      const putRes = await fetch(`${SERVER_BASE}/notes/${createData.note.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken ?? ''}` },
        body: JSON.stringify({ content: source.content ?? '' }),
      });
      const putData = await putRes.json();
      if (!putRes.ok) throw new Error(putData.error);

      recentLocalEditRef.current[putData.note.id] = Date.now();
      setCustomTabs(prev => [...prev, { ...putData.note, hidden: putData.note.hidden ?? false, folder_id: putData.note.folder_id ?? null }]);
      setCurrentTab(putData.note.id);
    } catch (err) {
      console.error('Errore duplicazione tab:', err);
    }
  };

  // Sposta una tab dentro/fuori una cartella (Note del GM/Campagna, vedi
  // useFolderSection.tsx) - stesso schema ottimistico + rollback di
  // handleToggleHideCustomTab sotto. Il server (PUT /notes/:id, vedi
  // index.tsx) azzera da solo folder_id se questa stessa richiesta cambiasse
  // anche `hidden` verso un namespace incompatibile - qui non succede mai
  // (le due patch restano sempre separate), quindi nessun caso da gestire
  // in piu' rispetto a un normale PUT.
  const handleMoveCustomTabToFolder = async (tabId: string, folderId: string | null) => {
    const tab = customTabs.find(t => t.id === tabId);
    if (!tab) return;
    const previousFolderId = tab.folder_id;
    recentLocalEditRef.current[tabId] = Date.now();
    setCustomTabs(prev => prev.map(t => (t.id === tabId ? { ...t, folder_id: folderId } : t)));
    try {
      const res = await fetch(`${SERVER_BASE}/notes/${tabId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken ?? ''}` },
        body: JSON.stringify({ folderId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'PUT folderId failed');
      // TEMP DEBUG - rimuovere dopo la diagnosi
      console.log('[TEMP handleMoveCustomTabToFolder] tabId=', tabId, 'entityType(hook)=', entityType, 'richiesto folderId=', folderId, 'server ha risposto=', data.note);
      // Il server puo' decidere un folder_id diverso da quello richiesto
      // (vedi index.tsx: se un'altra richiesta concorrente ha nel frattempo
      // cambiato `hidden` di questa nota, il trigger check_entity_notes_folder_type
      // potrebbe gia' averla staccata) - qui ci si allinea al valore
      // autorevole tornato dalla PUT invece di fidarsi ciecamente
      // dell'aggiornamento ottimistico sopra, che altrimenti resterebbe
      // silenziosamente divergente dal DB fino al prossimo fetch completo.
      setCustomTabs(prev => prev.map(t => (t.id === tabId ? { ...t, folder_id: data.note.folder_id ?? null } : t)));
    } catch (err) {
      console.error('Errore spostamento tab in cartella:', err);
      setCustomTabs(prev => prev.map(t => (t.id === tabId ? { ...t, folder_id: previousFolderId } : t)));
    }
  };

  const handleRenameCustomTab = async (tabId: string) => {
    if (!renameDraft.trim()) { setRenamingTabId(null); return; }
    recentLocalEditRef.current[tabId] = Date.now();
    try {
      const res = await fetch(`${SERVER_BASE}/notes/${tabId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken ?? ''}` },
        body: JSON.stringify({ tabName: renameDraft.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setCustomTabs(prev => prev.map(t => (t.id === tabId ? { ...t, tab_name: data.note.tab_name } : t)));
      }
    } catch (err) {
      console.error('Errore rinomina tab:', err);
    } finally {
      setRenamingTabId(null);
    }
  };

  const handleToggleHideCustomTab = async (tabId: string) => {
    const tab = customTabs.find(t => t.id === tabId);
    if (!tab) return;
    const nextHidden = !tab.hidden;
    recentLocalEditRef.current[tabId] = Date.now();
    setCustomTabs(prev => prev.map(t => (t.id === tabId ? { ...t, hidden: nextHidden } : t)));
    try {
      const res = await fetch(`${SERVER_BASE}/notes/${tabId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken ?? ''}` },
        body: JSON.stringify({ hidden: nextHidden }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'PUT hidden failed');
      // Cambiare `hidden` su una nota gia' in una cartella (Note del GM/
      // Campagna) puo' far si' che il server stacchi da solo folder_id
      // (index.tsx: la cartella apparteneva al namespace dell'hidden
      // precedente, non piu' valido per quello nuovo - vedi
      // supabase-add-notes-folders.sql) - senza riallinearsi qui, il
      // folder_id locale resta "a penzoloni" su una cartella dell'altro
      // namespace, mai combaciante con nessuna cartella dello scope
      // corrente ne' con "nessuna cartella": la nota sparisce dai conteggi
      // finche' non si ricarica da zero. Stesso principio gia' applicato in
      // handleMoveCustomTabToFolder.
      setCustomTabs(prev => prev.map(t => (t.id === tabId ? { ...t, hidden: data.note.hidden ?? false, folder_id: data.note.folder_id ?? null } : t)));
    } catch (err) {
      console.error('Errore nascondi tab:', err);
      setCustomTabs(prev => prev.map(t => (t.id === tabId ? { ...t, hidden: !nextHidden } : t)));
    }
  };

  // Chiamata SOLO dopo conferma nel ConfirmDialog (niente più window.confirm)
  const handleDeleteCustomTab = async (tabId: string) => {
    recentLocalEditRef.current[tabId] = Date.now();
    try {
      const accessTokenValue = accessToken ?? '';
      await fetch(`${SERVER_BASE}/notes/${tabId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessTokenValue}` },
      });
      setCustomTabs(prev => prev.filter(t => t.id !== tabId));
      setTabOrder(prev => {
        const next = prev.filter(id => id !== tabId);
        persistTabOrder(next);
        return next;
      });
      if (currentTab === tabId) setCurrentTab(defaultTabId);
    } catch (err) {
      console.error('Errore eliminazione tab:', err);
    } finally {
      setConfirmDeleteTabId(null);
    }
  };

  const handleCustomTabContentChange = (tabId: string, content: string) => {
    recentLocalEditRef.current[tabId] = Date.now();
    setCustomTabs(prev => prev.map(t => (t.id === tabId ? { ...t, content } : t)));
    if (customTabSaveTimerRef.current[tabId]) clearTimeout(customTabSaveTimerRef.current[tabId]);
    customTabSaveTimerRef.current[tabId] = setTimeout(async () => {
      try {
        await fetch(`${SERVER_BASE}/notes/${tabId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken ?? ''}` },
          body: JSON.stringify({ content }),
        });
      } catch (err) {
        console.error('Errore salvataggio contenuto tab:', err);
      }
    }, 400);
  };

  const orderedTabs: EntityOrderedTab[] = tabOrder
    .map(id => {
      const base = baseTabs.find(t => t.id === id);
      if (base) return { id: base.id, label: base.label, isCustom: false, hidden: false };
      const custom = customTabs.find(t => t.id === id);
      if (!custom) return null;
      return { id: custom.id, label: custom.tab_name, isCustom: true, hidden: custom.hidden };
    })
    .filter((t): t is EntityOrderedTab => t !== null)
    .filter(t => canEdit || !t.hidden);

  // Se la tab attiva è sparita (nascosta/eliminata da altri), torna alla tab di default
  useEffect(() => {
    if (!orderedTabs.some(t => t.id === currentTab)) setCurrentTab(defaultTabId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderedTabs.map(t => t.id).join(','), currentTab]);

  return {
    // TEMP DEBUG - rimuovere dopo la diagnosi
    __debugInstanceId: debugInstanceIdRef.current,
    customTabs,
    tabOrder,
    orderedTabs,
    currentTab,
    setCurrentTab,
    renamingTabId,
    setRenamingTabId,
    renameDraft,
    setRenameDraft,
    openMenuTabId,
    setOpenMenuTabId,
    confirmDeleteTabId,
    setConfirmDeleteTabId,
    draggedTabId,
    dragOverId,
    tabsContainerRef,
    handlePointerDownTab,
    handleAddCustomTab,
    handleDuplicateCustomTab,
    handleMoveCustomTabToFolder,
    handleRenameCustomTab,
    handleToggleHideCustomTab,
    handleDeleteCustomTab,
    handleCustomTabContentChange,
    reloadCustomTabs,
  };
}

export type UseEntityTabsResult = ReturnType<typeof useEntityTabs>;
