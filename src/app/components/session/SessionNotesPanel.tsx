import { useEffect, useState } from 'react';
import { Plus, FolderPlus } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useCampaign } from '../../campaigns/CampaignContext';
import { useCampaignNotesSection, type UseCampaignNotesSectionResult } from './shared/useCampaignNotesSection';
import { SectionHeader } from './shared/SectionHeader';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

type NotesScope = 'gm' | 'shared';

// Prima di questa versione, la navigazione delle note era un EntityTabBar
// orizzontale sopra il contenuto, con la colonna sinistra ridotta a due
// bottoni che smontavano/rimontavano l'intero pannello al cambio scope. Ora
// e' una lista verticale nella colonna sinistra (stesso schema di
// Personaggi/PNG/Mostri in SessionCharactersPanel.tsx): entrambe le sezioni
// (Campagna/GM) sono sempre montate (mai smontate al cambio di selezione),
// "Note del GM" resta visibile solo al GM (isOwner) - stessa gate di prima.
export function SessionNotesPanel() {
  const { user, session } = useAuth();
  const { activeCampaignId, activeCampaign, updateCampaign } = useCampaign();
  const isOwner = activeCampaign?.ownerId === user?.id;

  const [activeScope, setActiveScope] = useState<NotesScope>('shared');
  const [openSections, setOpenSections] = useState({ shared: true, gm: true });

  // Se isOwner diventa false mentre la sezione GM aveva la selezione attiva
  // (es. il GM passa la campagna ad altri mentre questo pannello e' aperto
  // altrove), torna a 'shared' invece di restare bloccato su una sezione ora
  // inaccessibile - stessa guardia dell'ex effectiveScope.
  useEffect(() => {
    if (activeScope === 'gm' && !isOwner) setActiveScope('shared');
  }, [isOwner]);

  const sharedSection = useCampaignNotesSection({
    campaignId: activeCampaignId,
    sessionKey: user?.id ?? null,
    accessToken: session?.access_token,
    canEdit: isOwner,
    scope: 'shared',
    savedTabOrder: activeCampaign?.tabOrderCampaignNotes ?? activeCampaign?.tabOrder,
    onPersistTabOrder: (order) => updateCampaign(activeCampaignId, { tabOrderCampaignNotes: order }),
    onSelectNote: () => setActiveScope('shared'),
  });

  // Chiamato SEMPRE (le regole di React vietano hook condizionali), ma
  // enabled:isOwner impedisce a un giocatore non-GM di interrogare il
  // server per le note del GM solo perche' questa istanza esiste
  // nell'albero dei componenti - vedi il commento su `enabled` in
  // useCampaignNotesSection.tsx/useEntityTabs.ts. Il suo output non viene
  // comunque mai renderizzato quando !isOwner (vedi il JSX sotto).
  const gmSection = useCampaignNotesSection({
    campaignId: activeCampaignId,
    sessionKey: user?.id ?? null,
    accessToken: session?.access_token,
    canEdit: isOwner,
    scope: 'gm',
    savedTabOrder: activeCampaign?.tabOrderGmNotes,
    onPersistTabOrder: (order) => updateCampaign(activeCampaignId, { tabOrderGmNotes: order }),
    onSelectNote: () => setActiveScope('gm'),
    enabled: isOwner,
  });

  const toggleSection = (key: keyof typeof openSections) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Pulsanti "nuova nota"/"nuova cartella" nell'header di sezione - stesso
  // slot extraAction gia' usato da PNG/Mostri in SessionCharactersPanel.tsx
  // (li' solo "nuova cartella"; qui in coppia, stessa idea).
  const renderSectionHeaderAction = (section: UseCampaignNotesSectionResult) => (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={section.handleAddNote}
            aria-label="Nuova nota"
            className="flex shrink-0 items-center rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-1.5 text-[var(--dash-muted)] transition-colors hover:text-[var(--dash-text-strong)]"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">Nuova nota</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={section.handleCreateFolder}
            disabled={section.createDisabledReason !== null}
            aria-label="Nuova cartella"
            className={`flex shrink-0 items-center rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-1.5 text-[var(--dash-muted)] transition-colors ${
              section.createDisabledReason !== null ? 'cursor-not-allowed opacity-40' : 'hover:text-[var(--dash-text-strong)]'
            }`}
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">{section.createDisabledReason ?? 'Nuova cartella'}</TooltipContent>
      </Tooltip>
    </div>
  );

  return (
    <>
      <div className="flex h-full select-none">
        <div className="w-64 shrink-0 overflow-y-auto border-r border-[var(--dash-border-soft)] py-3">
          <SectionHeader
            title="Note della Campagna"
            count={sharedSection.count}
            isOpen={openSections.shared}
            onToggle={() => toggleSection('shared')}
            extraAction={isOwner && openSections.shared ? renderSectionHeaderAction(sharedSection) : undefined}
          />
          {openSections.shared && <div className="space-y-1 px-2 pb-2">{sharedSection.renderSidebar()}</div>}

          {isOwner && (
            <>
              <SectionHeader
                title="Note del GM"
                count={gmSection.count}
                isOpen={openSections.gm}
                onToggle={() => toggleSection('gm')}
                extraAction={openSections.gm ? renderSectionHeaderAction(gmSection) : undefined}
              />
              {openSections.gm && <div className="space-y-1 px-2 pb-2">{gmSection.renderSidebar()}</div>}
            </>
          )}
        </div>

        <div className="flex-1 overflow-auto p-4">
          {activeScope === 'gm' && isOwner ? gmSection.renderDetail() : sharedSection.renderDetail()}
        </div>
      </div>
      {sharedSection.renderDialogs()}
      {isOwner && gmSection.renderDialogs()}
    </>
  );
}
