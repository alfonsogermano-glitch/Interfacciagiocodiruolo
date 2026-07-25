import { useState } from 'react';
import { BookOpen, ShieldEllipsis } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useCampaign } from '../../campaigns/CampaignContext';
import { CampaignNotesPanel } from './shared/CampaignNotesPanel';

type NotesScope = 'gm' | 'shared';

// Prima di questa versione, la colonna sinistra elencava anche una riga per
// ogni PG/PNG/Mostro (fetch dedicato di characters/npcs/monsters), aprendo
// le stesse entity_notes gia' raggiungibili dalla scheda dettaglio di
// quell'entita' in "Schede" (SessionCharactersPanel.tsx -> EntityDetailView
// -> EntityTabBar, interfaccia piu' completa: rinomina/nascondi-mostra/
// riordino drag assenti qui). Verificato: nessuna perdita di accesso a
// rimuoverla, solo un click in piu' ("Schede" invece di "Note") per le note
// di una singola entita' - vedi l'indagine che ha preceduto questa feature.
export function SessionNotesPanel() {
  const { user, session } = useAuth();
  const { activeCampaignId, activeCampaign, updateCampaign } = useCampaign();
  const [scope, setScope] = useState<NotesScope>('shared');

  const isOwner = activeCampaign?.ownerId === user?.id;

  // Un giocatore non-GM non ha comunque accesso in lettura alle note del GM
  // (hidden=true su entity_type='campaign' - vedi canAccessEntityNotes in
  // index.tsx, mode 'read' ammesso solo se isGm): la sezione non compare
  // affatto invece di comparire vuota/bloccata. Se lo scope corrente era
  // 'gm' quando isOwner diventa false (es. il GM passa la campagna ad altri
  // mentre questo pannello e' aperto altrove), torna a 'shared' invece di
  // restare bloccato su una sezione ora inaccessibile.
  const effectiveScope: NotesScope = isOwner ? scope : 'shared';

  return (
    <div className="flex h-full select-none">
      <div className="w-48 shrink-0 overflow-y-auto border-r border-[var(--dash-border-soft)] py-3">
        <div className="space-y-1 px-2">
          <button
            type="button"
            onClick={() => setScope('shared')}
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
              effectiveScope === 'shared'
                ? 'bg-[var(--dash-surface-2)] text-[var(--dash-text-strong)]'
                : 'text-[var(--dash-text)] hover:bg-[var(--dash-surface-2)]/50'
            }`}
          >
            <BookOpen className="h-4 w-4 shrink-0" />
            <span className="truncate">Note della Campagna</span>
          </button>
          {isOwner && (
            <button
              type="button"
              onClick={() => setScope('gm')}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                effectiveScope === 'gm'
                  ? 'bg-[var(--dash-surface-2)] text-[var(--dash-text-strong)]'
                  : 'text-[var(--dash-text)] hover:bg-[var(--dash-surface-2)]/50'
              }`}
            >
              <ShieldEllipsis className="h-4 w-4 shrink-0" />
              <span className="truncate">Note del GM</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <CampaignNotesPanel
          campaignId={activeCampaignId}
          sessionKey={user?.id ?? null}
          accessToken={session?.access_token}
          canEdit={isOwner}
          scope={effectiveScope}
          savedTabOrder={effectiveScope === 'gm' ? activeCampaign?.tabOrderGmNotes : (activeCampaign?.tabOrderCampaignNotes ?? activeCampaign?.tabOrder)}
          onPersistTabOrder={(order) => updateCampaign(
            activeCampaignId,
            effectiveScope === 'gm' ? { tabOrderGmNotes: order } : { tabOrderCampaignNotes: order }
          )}
        />
      </div>
    </div>
  );
}
