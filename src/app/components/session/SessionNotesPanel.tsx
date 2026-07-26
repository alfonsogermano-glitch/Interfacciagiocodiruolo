import { useEffect, useState } from 'react';
import { Plus, FolderPlus, RotateCcw, Trash2 } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useCampaign } from '../../campaigns/CampaignContext';
import { useCampaignNotesSection, type UseCampaignNotesSectionResult } from './shared/useCampaignNotesSection';
import { useNotesTrash } from './shared/useNotesTrash';
import { SectionHeader } from './shared/SectionHeader';
import { TrashRow } from './shared/TrashRow';
import { ConfirmDialog } from '../shared/ConfirmDialog';
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
  const [openSections, setOpenSections] = useState({ shared: true, gm: true, trash: false });
  const [confirmEmptyTrash, setConfirmEmptyTrash] = useState(false);

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

  // Owner-only come gmSection sopra, stesso principio (hook chiamato sempre,
  // enabled ne disabilita fetch/sottoscrizione per chi non e' GM).
  const trash = useNotesTrash({
    campaignId: activeCampaignId,
    accessToken: session?.access_token,
    enabled: isOwner,
  });

  const toggleSection = (key: keyof typeof openSections) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Lista piatta unica (note + cartelle), piu' recente cestinato per primo -
  // il Cestino non distingue GM/Campagna in sezioni separate (vedi il
  // piano), solo un'etichetta per riga.
  const trashRows = [
    ...trash.folders.map((f) => ({
      key: `folder-${f.id}`,
      name: f.name,
      typeLabel: 'Cartella',
      scopeLabel: f.entity_type === 'gmnotes' ? 'GM' : 'Campagna',
      deletedAt: f.deleted_at,
      onRestore: () => trash.restoreFolder(f.id),
      onPurge: () => trash.purgeFolder(f.id),
    })),
    ...trash.notes.map((n) => ({
      key: `note-${n.id}`,
      name: n.tab_name,
      typeLabel: n.entity_type === 'campaign' ? 'Nota' : 'Sotto-tab',
      scopeLabel: n.hidden ? 'GM' : 'Campagna',
      deletedAt: n.deleted_at,
      onRestore: () => trash.restoreNote(n.id),
      onPurge: () => trash.purgeNote(n.id),
    })),
  ].sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : -1));

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
                title="Cestino"
                count={trash.count}
                isOpen={openSections.trash}
                onToggle={() => toggleSection('trash')}
                extraAction={openSections.trash && trash.count > 0 ? (
                  <div className="flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={trash.restoreAll}
                          aria-label="Ripristina tutto"
                          className="flex shrink-0 items-center rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-1.5 text-[var(--dash-muted)] transition-colors hover:text-[var(--dash-text-strong)]"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="left">Ripristina tutto</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => setConfirmEmptyTrash(true)}
                          aria-label="Svuota cestino"
                          className="flex shrink-0 items-center rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-1.5 text-[var(--dash-muted)] transition-colors hover:text-[var(--dash-danger-text)]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="left">Svuota cestino</TooltipContent>
                    </Tooltip>
                  </div>
                ) : undefined}
              />
              {openSections.trash && (
                <div className="space-y-1 px-2 pb-2">
                  {trashRows.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-[var(--dash-muted)]">Cestino vuoto.</div>
                  ) : (
                    trashRows.map((row) => (
                      <TrashRow
                        key={row.key}
                        name={row.name}
                        typeLabel={row.typeLabel}
                        scopeLabel={row.scopeLabel}
                        onRestore={row.onRestore}
                        onPurge={row.onPurge}
                      />
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex-1 overflow-auto p-4">
          {isOwner && openSections.trash ? (
            // Il Cestino non ha una vista di dettaglio (nessuna riga e'
            // "selezionabile", vedi TrashRow.tsx: solo Ripristina/Elimina
            // definitivamente nella lista stessa) - senza questo controllo
            // il pannello continuerebbe a mostrare l'ultima nota attiva
            // selezionata prima di aprire il Cestino (tabs.currentTab non
            // viene mai toccato da qui, resta esattamente quello che era).
            <div className="flex h-full items-center justify-center text-center text-sm text-[var(--dash-muted)]">
              Elementi nel cestino — usa "Ripristina" o "Elimina definitivamente" dalla lista.
            </div>
          ) : activeScope === 'gm' && isOwner ? gmSection.renderDetail() : sharedSection.renderDetail()}
        </div>
      </div>
      {sharedSection.renderDialogs()}
      {isOwner && gmSection.renderDialogs()}
      {confirmEmptyTrash && (
        <ConfirmDialog
          title="Svuotare il cestino?"
          message="Tutti gli elementi nel cestino verranno eliminati per sempre. Questa azione non è reversibile."
          confirmLabel="Svuota per sempre"
          onConfirm={() => { setConfirmEmptyTrash(false); trash.emptyTrash(); }}
          onCancel={() => setConfirmEmptyTrash(false)}
        />
      )}
    </>
  );
}
