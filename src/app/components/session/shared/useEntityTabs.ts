import { useEffect, useRef, useState } from 'react';
import { projectId } from '/utils/supabase/info';

const SERVER_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-771c5bfd`;

const DRAG_THRESHOLD_PX = 6;

export type EntityTabsEntityType = 'character' | 'npc' | 'monster';

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

  // Fetch delle note (tab personalizzate) dell'entità selezionata
  useEffect(() => {
    if (!entityId) {
      setCustomTabs([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${SERVER_BASE}/campaigns/${campaignId}/notes?entityType=${entityType}&entityId=${entityId}`,
          { headers: { Authorization: `Bearer ${accessToken ?? ''}` } }
        );
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) {
          const sorted = (data.notes ?? [])
            .map((n: any) => ({ ...n, hidden: n.hidden ?? false }))
            .sort((a: any, b: any) => a.position - b.position);
          setCustomTabs(sorted);
        }
      } catch (err) {
        console.error('Errore caricamento tab personalizzate:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [entityId, campaignId, accessToken, entityType]);

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

  const handleAddCustomTab = async () => {
    if (!entityId) return;
    try {
      const res = await fetch(`${SERVER_BASE}/campaigns/${campaignId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken ?? ''}` },
        body: JSON.stringify({ entityType, entityId, tabName: 'Nuova tab' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCustomTabs(prev => [...prev, { ...data.note, hidden: data.note.hidden ?? false }]);
      setCurrentTab(data.note.id);
      // Entra subito in rinomina: il "+" crea e si passa direttamente al nome
      setRenamingTabId(data.note.id);
      setRenameDraft('Nuova tab');
    } catch (err) {
      console.error('Errore creazione tab:', err);
    }
  };

  const handleRenameCustomTab = async (tabId: string) => {
    if (!renameDraft.trim()) { setRenamingTabId(null); return; }
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
    setCustomTabs(prev => prev.map(t => (t.id === tabId ? { ...t, hidden: nextHidden } : t)));
    try {
      const res = await fetch(`${SERVER_BASE}/notes/${tabId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken ?? ''}` },
        body: JSON.stringify({ hidden: nextHidden }),
      });
      if (!res.ok) throw new Error('PUT hidden failed');
    } catch (err) {
      console.error('Errore nascondi tab:', err);
      setCustomTabs(prev => prev.map(t => (t.id === tabId ? { ...t, hidden: !nextHidden } : t)));
    }
  };

  // Chiamata SOLO dopo conferma nel ConfirmDialog (niente più window.confirm)
  const handleDeleteCustomTab = async (tabId: string) => {
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
    handleRenameCustomTab,
    handleToggleHideCustomTab,
    handleDeleteCustomTab,
    handleCustomTabContentChange,
  };
}

export type UseEntityTabsResult = ReturnType<typeof useEntityTabs>;
