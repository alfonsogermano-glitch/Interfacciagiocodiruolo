import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { toast } from 'sonner';
import { useCampaign } from '../../campaigns/CampaignContext';
import { loadCampaignDocumentOrNull, saveCampaignDocument } from '../../../services/storage/campaignDocuments';
import { persistenceKey } from '../../../services/storage/persistenceMode';
import { CAMPAIGN_STORAGE_KEYS } from '../../../services/campaign/campaignStorageKeys';

// Chiavi legacy localStorage da cui ereditare i dati esistenti una tantum:
// mappa, combattimento e incontro attivo vivevano li' prima del passaggio
// ai documenti campagna (l'archivio scelto dall'utente).
const LEGACY_LOCAL_KEYS: Record<string, string> = {
  map: CAMPAIGN_STORAGE_KEYS.maps,
  combat: CAMPAIGN_STORAGE_KEYS.combat,
  'active-encounter': 'hsc_active_encounter'
};

function readLegacyDocument<T>(key: string): T | null {
  const legacyKey = LEGACY_LOCAL_KEYS[key];
  if (!legacyKey || typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(legacyKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (parsed === null || parsed === undefined) return null;
    return parsed as T;
  } catch {
    return null;
  }
}

export function useCampaignDocument<T>(key: string, fallback: T): [T, Dispatch<SetStateAction<T>>] {
  const { activeCampaignId } = useCampaign();
  const scope = persistenceKey(`${activeCampaignId}:${key}`);
  const [record, setRecord] = useState({ scope, value: fallback, ready: false, dirty: false });
  const queue = useRef(Promise.resolve());
  const legacyKeyRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    legacyKeyRef.current = null;
    setRecord({ scope, value: fallback, ready: false, dirty: false });

    void loadCampaignDocumentOrNull<T>(activeCampaignId, key).then((stored) => {
      if (cancelled) return;

      if (stored !== null) {
        setRecord((current) => ({ scope, value: current.dirty ? current.value : stored, ready: true, dirty: current.dirty }));
        return;
      }

      const legacy = readLegacyDocument<T>(key);
      if (legacy === null) {
        setRecord((current) => ({ scope, value: current.dirty ? current.value : fallback, ready: true, dirty: current.dirty }));
        return;
      }

      // Primo accesso dopo il passaggio ai documenti: eredito il dato legacy
      // e lo salvo nell'archivio scelto; la chiave veccia viene rimossa solo
      // dopo un salvataggio riuscito.
      legacyKeyRef.current = LEGACY_LOCAL_KEYS[key] ?? null;
      setRecord((current) => ({ scope, value: current.dirty ? current.value : legacy, ready: true, dirty: true }));
    }).catch((error) => {
      if (!cancelled) toast.error(`Caricamento ${key}: ${error.message}`);
    });

    return () => { cancelled = true; };
  }, [scope]);

  useEffect(() => {
    if (!record.ready || !record.dirty || record.scope !== scope) return;
    const value = record.value;
    queue.current = queue.current.catch(() => {}).then(async () => {
      if (persistenceKey(`${activeCampaignId}:${key}`) !== scope) return;
      await saveCampaignDocument(activeCampaignId, key, value);
      if (legacyKeyRef.current) {
        try { window.localStorage.removeItem(legacyKeyRef.current); } catch { /* quota */ }
        legacyKeyRef.current = null;
      }
    }).catch((error) => { toast.error(`Salvataggio ${key}: ${error.message}`); });
  }, [record.value, record.ready]);

  const setValue: Dispatch<SetStateAction<T>> = (update) => setRecord((current) => ({
    ...current, dirty: true,
    value: typeof update === 'function' ? (update as (value: T) => T)(current.value) : update,
  }));

  return [record.scope === scope ? record.value : fallback, setValue];
}
