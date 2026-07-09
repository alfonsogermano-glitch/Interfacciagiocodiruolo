import { useState, useEffect, type ReactNode } from 'react';
import { User, Brain, Heart, Star, Ghost, Skull, Lock } from 'lucide-react';
import { FrischezzaTracker } from '../../FrischezzaTracker';
import { FoliaSpiral } from '../../FoliaSpiral';
import { ConditionsPanel } from '../../ConditionsPanel';
import { TurbePanel } from '../../TurbePanel';
import { EquipmentPanel as LegacyEquipmentPanel } from '../../EquipmentPanel';
import { DraggablePortrait } from './DraggablePortrait';
import { EntityTabBar } from './EntityTabBar';
import { EntityDetailRail, type EntityDetailRailSection } from './EntityDetailRail';
import { TokenStyleEditor } from '../../shared/TokenStyleEditor';
import type { ImageCrop } from '../../gm/monsters/monstersTypes';
import { ConfirmDialog } from '../../shared/ConfirmDialog';
import { FreschezzaBoxesEditor } from '../../shared/FreschezzaBoxesEditor';
import { D20StatBlock, DEFAULT_D20_STATS } from '../../ruleset/D20StatBlock';
import { useEntityTabs, type EntityTabsEntityType } from './useEntityTabs';
import { useRuleset } from '../../../campaigns/RulesetContext';
import { RulesetTag } from '../../shared/RulesetTag';
import type { Stile, Viaggio, Trait } from '../../../../types/character';
import type { Adventure } from '../../../../types/adventure';
import { STYLE_TRAITS, JOURNEY_TRAITS } from '../../../../data/traits';
import { VIAGGI_PER_STILE, calculateAmbiti, NOTABLE_CITIZENS, LATER_SENTINEL } from '../../../../data/characterCalculations';
import { loadNPCs, loadAdventures } from '../../../../services/supabase/entitiesService';
import { loadCharacters } from '../../../../services/supabase/charactersService';
import { loadEnvironmentReferences, type EntityReference } from '../../../../services/campaign/entityReferenceService';
import { FreschezzaMaxEditor, FreschezzaBoxesEditor as MonsterFreschezzaBoxesEditor } from '../../gm/monsters/MonsterFreschezzaComponents';
import { CatalogSelectionBlock, CustomEntriesEditor } from '../../gm/monsters/MonsterCatalogComponents';
import { TERRIFYING_TRAIT_ID, FOLLIA_DIFFICULTY_OPTIONS } from '../../gm/monsters/monstersTypes';
import { getMonsterCriticalBoxes, clampMonsterAudacia, normalizeTiroFollia, generateId as generateMonsterEntryId, calculateAudaciaGainFromFreshnessChange } from '../../gm/monsters/monstersUtils';
import { MONSTER_TRAITS_CATALOG } from '../../../../data/monsterTraitsCatalog';
import { MONSTER_SPECIAL_ACTIONS_CATALOG } from '../../../../data/monsterSpecialActionsCatalog';

// Stesse opzioni di NPCManager.tsx/MonstersManager.tsx (DIFFICULTY_OPTIONS) -
// duplicate qui perche' nessuno dei due espone un modulo condiviso per
// questo array; usata sia per Attacco/Difesa dei PNG che dei Mostri.
const DIFFICULTY_OPTIONS = ['', 'Base', 'Critico', 'Estremo', 'Impossibile', 'Non euclideo'] as const;

const ABILITA_PER_AMBITO: Record<string, string[]> = {
  Fisico: ['Muscoli', 'Sport', 'Acrobatica', 'Resistenza', 'Freddezza'],
  Scuola: ['Cultura', 'Tecnologia', 'Studio', 'Pronto Soccorso', 'Scienze'],
  Carisma: ['Esibirsi', 'Parlantina', 'Fascino', 'Intuito', 'Leadership'],
  Strada: ['Furtività', 'Mira', 'Sopravvivenza', 'Crimine', 'Allerta'],
};

const CHARACTER_BASE_TABS = [
  { id: 'summary', label: 'Riepilogo' },
  { id: 'conditions', label: 'Condizioni & Follia' },
  { id: 'equipment', label: 'Equipaggiamento' },
  { id: 'origins', label: 'Origini' },
  { id: 'storia', label: 'Storia' },
] as const;

// Un tratto salvato e' compatibile con lo Stile/Viaggio corrente solo se
// proviene dalle rispettive pool (STYLE_TRAITS/JOURNEY_TRAITS): tratti[0] e'
// sempre il tratto di Stile, tratti[1..2] i tratti di Viaggio - stessa
// convenzione di CharacterCreationWizard.tsx.
function tratiCompatibiliConOrigine(tratti: Trait[], style: Stile, viaggio: Viaggio): boolean {
  if (!tratti || tratti.length === 0) return true;
  const styleNames = new Set(STYLE_TRAITS[style].map(t => t.name));
  const journeyNames = new Set(JOURNEY_TRAITS[viaggio].map(t => t.name));
  const [styleTrait, ...journeyTraits] = tratti;
  if (styleTrait && !styleNames.has(styleTrait.name)) return false;
  return journeyTraits.every(t => journeyNames.has(t.name));
}

// Per ora PNG e Mostri hanno solo la tab "Riepilogo": altre eventuali tab
// base verranno aggiunte in seguito.
const NPC_MONSTER_BASE_TABS = [
  { id: 'summary', label: 'Riepilogo' },
] as const;

function AbilitaDots({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled: boolean }) {
  const dots = [1, 2, 3, 4];
  return (
    <div className="flex gap-1">
      {dots.map((dot) => {
        const filled = dot <= value;
        return (
          <button
            key={dot}
            type="button"
            disabled={disabled}
            onClick={() => onChange(filled && dot === value ? dot - 1 : dot)}
            className={`h-3.5 w-3.5 rounded-full border transition-all ${
              filled ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)]' : 'border-[var(--dash-border-soft)] bg-transparent'
            } ${disabled ? '' : 'hover:scale-125'}`}
          />
        );
      })}
    </div>
  );
}

function StarRating({ value, max, onChange, disabled }: { value: number; max: number; onChange: (v: number) => void; disabled: boolean }) {
  const stars = Array.from({ length: max }, (_, i) => i + 1);
  return (
    <div className="flex items-center justify-between">
      <div className="flex gap-1">
        {stars.map((star) => {
          const filled = star <= value;
          return (
            <button
              key={star}
              type="button"
              disabled={disabled}
              onClick={() => onChange(filled ? star - 1 : star)}
              className={disabled ? '' : 'transition-transform hover:scale-110'}
            >
              <Star
                className="h-5 w-5"
                fill={filled ? '#eab308' : 'none'}
                color={filled ? '#eab308' : 'var(--dash-border-soft)'}
                strokeWidth={filled ? 1 : 1.5}
              />
            </button>
          );
        })}
      </div>
      <span className="text-xs text-yellow-500/70">{value} / {max}</span>
    </div>
  );
}

interface EntityDetailViewProps {
  entityType: EntityTabsEntityType;
  entity: any;
  onUpdate: (updated: any) => void;
  canEdit: boolean;
  campaignId: string | null;
  accessToken: string | null | undefined;
  isHSC: boolean;
  draggable: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  headerAction?: ReactNode;
  /** true per una bozza locale mai salvata su Supabase (es. "+ Nuovo PNG"/
   *  "+ Nuovo Mostro" prima che venga compilato un nome): disattiva le tab
   *  personalizzate (useEntityTabs), che altrimenti interrogherebbero un
   *  endpoint per un'entità/campagna che non esiste ancora, producendo
   *  errori 403/404 in console. Default false per non toccare gli usi
   *  esistenti (entità sempre reali, es. SessionCharactersPanel.tsx). */
  isDraft?: boolean;
  /** Riga proprietario (avatar + nome), solo per i PG. Nascosta quando il
   *  "proprietario" coincide sempre col viewer (es. MyCharactersPage), dove
   *  sarebbe informazione ridondante. */
  showOwnerRow?: boolean;
  /** false quando il chiamante mostra la rail altrove (es. MyCharactersPage,
   *  che la monta nello slot rightSidebar di AppShell per ancorarla al bordo
   *  schermo) invece che inline qui dentro. Default true per non cambiare
   *  nulla nell'uso esistente in SessionCharactersPanel.tsx. */
  showRail?: boolean;
  /** Pool per il selettore "Legame" nella tab Origini: altri personaggi
   *  posseduti dall'utente non ancora assegnati a una campagna. Vuota (e
   *  quindi selettore di fatto inutilizzabile) nei contesti dove la tab e'
   *  comunque sempre bloccata, es. in sessione (campaignId sempre valorizzato). */
  linkableCharacters?: Array<{ id: string; name: string }>;
  /** Sezione attiva della rail (Scheda/Token). Controllata dal chiamante
   *  quando la rail e' renderizzata altrove (MyCharactersPage, che monta
   *  EntityDetailRail separatamente in rightSidebar): senza queste due prop
   *  il click su "Token" li' non avrebbe modo di raggiungere questa vista.
   *  Se omesse, il componente gestisce la sezione da solo (SessionCharactersPanel,
   *  dove la rail e' interna, vedi showRail sopra). */
  activeSection?: EntityDetailRailSection;
  onActiveSectionChange?: (section: EntityDetailRailSection) => void;
}

export function EntityDetailView({
  entityType,
  entity,
  onUpdate,
  canEdit,
  campaignId,
  accessToken,
  isHSC,
  draggable,
  onDragStart,
  headerAction,
  showOwnerRow = true,
  showRail = true,
  linkableCharacters = [],
  isDraft = false,
  activeSection: controlledActiveSection,
  onActiveSectionChange,
}: EntityDetailViewProps) {
  const [internalActiveSection, setInternalActiveSection] = useState<EntityDetailRailSection>('scheda');
  const activeSection = controlledActiveSection ?? internalActiveSection;
  const setActiveSection = onActiveSectionChange ?? setInternalActiveSection;
  const [expandedAmbito, setExpandedAmbito] = useState<string | null>(null);
  const [originsWarning, setOriginsWarning] = useState<string | null>(null);
  const [tutoreInputTypeOverride, setTutoreInputTypeOverride] = useState<'custom' | 'notable' | 'later' | 'npc' | null>(null);
  const [tipoSpecialeInputTypeOverride, setTipoSpecialeInputTypeOverride] = useState<'custom' | 'notable' | 'later' | 'npc' | null>(null);
  const [pendingOrigin, setPendingOrigin] = useState<{ style: Stile; viaggio: Viaggio; triggeredBy: 'style' | 'viaggio' } | null>(null);
  const [campaignNpcs, setCampaignNpcs] = useState<Array<{ id: string; name: string; visibleToPlayers?: boolean }>>([]);
  const [campaignCharacters, setCampaignCharacters] = useState<Array<{ id: string; name: string }>>([]);
  const [campaignAdventures, setCampaignAdventures] = useState<Adventure[]>([]);
  const [campaignEnvironments, setCampaignEnvironments] = useState<EntityReference[]>([]);

  // Stessa determinazione di ruleset gia' usata in NPCManager.tsx
  // (const isD20 = isDnD5e || isPathfinder), per applicare le identiche
  // condizioni di visibilita' ai campi PNG specifici del sistema d20.
  const { isDnD5e, isPathfinder } = useRuleset();
  const isD20 = isDnD5e || isPathfinder;

  // Le tab modalita' custom/notable sono scelte di presentazione locali (non
  // dati salvati): vanno azzerate quando si passa a un'altra entita', altrimenti
  // resterebbero "incollate" alla modalita' scelta per l'entita' precedente.
  useEffect(() => {
    setOriginsWarning(null);
    setTutoreInputTypeOverride(null);
    setTipoSpecialeInputTypeOverride(null);
    setPendingOrigin(null);
  }, [entity?.id]);

  // Pool "PNG della campagna" per Tutore/Tipo Speciale nella tab Storia,
  // visibile solo quando il personaggio e' assegnato a una campagna. Stesso
  // filtro per visibleToPlayers gia' usato in SessionCharactersPanel.tsx per
  // mostrare ai giocatori solo i PNG resi disponibili dal GM.
  useEffect(() => {
    if (!campaignId || entityType !== 'character') {
      setCampaignNpcs([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const npcs = await loadNPCs(campaignId);
      if (!cancelled) setCampaignNpcs(npcs.filter(n => n.visibleToPlayers));
    })();
    return () => { cancelled = true; };
  }, [campaignId, entityType]);

  // Pool "altri PG" per il selettore Legame nella tab Storia: quando il
  // personaggio e' in una campagna, la pool sensata sono gli altri PG della
  // STESSA campagna (loadCharacters(campaignId), auto-fetchata qui - stesso
  // pattern di campaignNpcs sopra), non piu' "miei personaggi non assegnati"
  // (che una volta assegnati sarebbe quasi sempre vuota/irrilevante). La prop
  // linkableCharacters (calcolata dal chiamante, che sa chi e' l'utente
  // corrente) resta l'unica fonte possibile quando non c'e' ancora una
  // campagna, dato che EntityDetailView non sa chi e' l'utente.
  useEffect(() => {
    if (!campaignId || entityType !== 'character') {
      setCampaignCharacters([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const characters = await loadCharacters(campaignId);
      if (!cancelled) setCampaignCharacters(characters);
    })();
    return () => { cancelled = true; };
  }, [campaignId, entityType]);

  // Pool "Ambito narrativo"/"Luogo" per PNG e Mostri, stesso concetto di
  // NPCManager.tsx/MonstersManager.tsx (adventureId/environmentId) ma qui
  // l'entita' potrebbe non avere ancora una campagna: senza campaignId questi
  // campi non hanno senso (nessuna pool da cui scegliere) e restano nascosti,
  // vedi sotto.
  useEffect(() => {
    if (!campaignId || (entityType !== 'npc' && entityType !== 'monster')) {
      setCampaignAdventures([]);
      setCampaignEnvironments([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const [adventures, environments] = await Promise.all([
        loadAdventures(campaignId),
        loadEnvironmentReferences(campaignId),
      ]);
      if (cancelled) return;
      setCampaignAdventures(adventures);
      setCampaignEnvironments(environments);
    })();
    return () => { cancelled = true; };
  }, [campaignId, entityType]);

  const legamePool = (campaignId ? campaignCharacters : linkableCharacters).filter(c => c.id !== entity?.id);

  const isOriginsLocked = !canEdit || !!campaignId;

  // Il cambio effettivo (ricalcolo ambiti + eventuale reset tratti) avviene
  // solo dopo la conferma esplicita nel dialog sotto: le Abilità in
  // "Riepilogo" non vengono ricalcolate (i punti bonus assegnati in
  // creazione non sono persistiti separatamente, vedi characterCalculations.ts),
  // quindi ogni cambio le rende potenzialmente incoerenti - l'utente deve
  // vederlo e confermarlo attivamente, non solo leggerlo in un banner
  // ignorabile dopo il fatto.
  const applyOriginChange = (nextStyle: Stile, nextViaggio: Viaggio) => {
    const nextAmbiti = calculateAmbiti(nextStyle, nextViaggio);
    const currentTratti: Trait[] = entity.tratti ?? [];
    const staysCompatible = tratiCompatibiliConOrigine(currentTratti, nextStyle, nextViaggio);
    const nextTratti = staysCompatible ? currentTratti : [];

    setOriginsWarning(
      !staysCompatible && currentTratti.length > 0
        ? 'I tratti selezionati non erano più compatibili con il nuovo Stile/Viaggio e sono stati azzerati: selezionane di nuovi qui sotto.'
        : null
    );

    onUpdate({ ...entity, style: nextStyle, viaggio: nextViaggio, ambiti: nextAmbiti, tratti: nextTratti });
  };

  const requestOriginChange = (nextStyle: Stile, nextViaggio: Viaggio, triggeredBy: 'style' | 'viaggio') => {
    if (nextStyle === entity.style && nextViaggio === entity.viaggio) return;
    setPendingOrigin({ style: nextStyle, viaggio: nextViaggio, triggeredBy });
  };

  // Il dialog di conferma nomina il campo in base al controllo che l'utente
  // ha effettivamente cliccato (triggeredBy), non al confronto dei valori
  // grezzi: il pulsante Stile riassegna sempre anche il primo Viaggio della
  // nuova pool (VIAGGI_PER_STILE[st][0], nessun valore in comune tra pool di
  // stili diversi), quindi un confronto per valore risulterebbe quasi sempre
  // "entrambi cambiati" anche quando l'utente ha interagito solo con Stile.
  const pendingOriginFieldLabel = pendingOrigin?.triggeredBy === 'style' ? 'Stile' : 'Viaggio';
  const pendingOriginValueLabel = pendingOrigin?.triggeredBy === 'style' ? pendingOrigin?.style : pendingOrigin?.viaggio;

  const legameSelectValue = entity?.linkedCharacterId
    ? entity.linkedCharacterId
    : entity?.legame === LATER_SENTINEL
      ? 'LATER'
      : '';

  const handleLegameSelectChange = (value: string) => {
    if (value === 'LATER') {
      onUpdate({ ...entity, legame: LATER_SENTINEL, linkedCharacterId: undefined, legameDescription: undefined });
    } else if (value === '') {
      onUpdate({ ...entity, legame: '', linkedCharacterId: undefined, legameDescription: undefined });
    } else {
      onUpdate({
        ...entity,
        legame: 'Legame con personaggio',
        linkedCharacterId: value,
        legameDescription: entity.linkedCharacterId === value ? entity.legameDescription : '',
      });
    }
  };

  const campaignNpcNames = new Set(campaignNpcs.map(n => n.name));

  const tutoreInputType =
    tutoreInputTypeOverride ??
    (entity?.tutore === LATER_SENTINEL
      ? 'later'
      : entity?.tutore && campaignNpcNames.has(entity.tutore)
        ? 'npc'
        : entity?.tutore && NOTABLE_CITIZENS.includes(entity.tutore)
          ? 'notable'
          : 'custom');

  const tipoSpecialeInputType =
    tipoSpecialeInputTypeOverride ??
    (entity?.tipoSpeciale === LATER_SENTINEL
      ? 'later'
      : entity?.tipoSpeciale && campaignNpcNames.has(entity.tipoSpeciale)
        ? 'npc'
        : entity?.tipoSpeciale && NOTABLE_CITIZENS.includes(entity.tipoSpeciale)
          ? 'notable'
          : 'custom');

  const currentStyleTrait: Trait | null = entity?.tratti?.[0] ?? null;
  const currentJourneyTraits: Trait[] = entity?.tratti?.slice(1, 3) ?? [];

  const selectStyleTrait = (trait: Trait) => {
    onUpdate({ ...entity, tratti: [trait, ...currentJourneyTraits] });
  };

  const toggleJourneyTrait = (trait: Trait) => {
    const exists = currentJourneyTraits.some(t => t.name === trait.name);
    let nextJourney: Trait[];
    if (exists) {
      nextJourney = currentJourneyTraits.filter(t => t.name !== trait.name);
    } else if (currentJourneyTraits.length < 2) {
      nextJourney = [...currentJourneyTraits, trait];
    } else {
      return;
    }
    onUpdate({ ...entity, tratti: currentStyleTrait ? [currentStyleTrait, ...nextJourney] : nextJourney });
  };

  const originToggleClass = (active: boolean) =>
    `rounded-md border px-3 py-2 text-sm transition-colors ${
      active
        ? 'border-[var(--dash-accent)] bg-[var(--dash-surface)] text-[var(--dash-text-strong)]'
        : 'border-[var(--dash-border)] bg-[var(--dash-surface-2)] text-[var(--dash-muted)]'
    }`;

  const traitOptionClass = (active: boolean) =>
    `w-full rounded-xl border p-3 text-left transition-colors ${
      active
        ? 'border-[var(--dash-accent)] bg-[var(--dash-surface)]'
        : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] hover:bg-[var(--dash-surface-2)]'
    }`;

  const baseTabs = entityType === 'character' ? CHARACTER_BASE_TABS : NPC_MONSTER_BASE_TABS;

  const tabs = useEntityTabs({
    entityType,
    // null finche' e' una bozza mai salvata: riusa il guard "!entityId" gia'
    // presente in useEntityTabs per non interrogare un endpoint riferito a
    // un'entita'/campagna che non esiste ancora (vedi isDraft sopra).
    entityId: isDraft ? null : (entity?.id ?? null),
    campaignId,
    accessToken,
    canEdit,
    baseTabs: baseTabs.map(t => ({ id: t.id, label: t.label })),
    savedTabOrder: entity?.tabOrder,
    onPersistTabOrder: (order) => {
      onUpdate({ ...entity, tabOrder: order });
    },
  });

  const updateAmbito = (ambito: string, delta: number) => {
    const currentValue = (entity.ambiti as any)[ambito] ?? 0;
    const nextValue = Math.max(0, Math.min(2, currentValue + delta));
    onUpdate({ ...entity, ambiti: { ...entity.ambiti, [ambito]: nextValue } });
  };

  const fallbackIcon =
    entityType === 'character' ? (
      <User className="h-12 w-12 text-[var(--dash-accent-2)]" />
    ) : entityType === 'npc' ? (
      <Ghost className="h-6 w-6 text-[var(--dash-accent-2)]" />
    ) : (
      <Skull className="h-6 w-6 text-[var(--dash-accent-2)]" />
    );

  const portraitUrl =
    entityType === 'monster' ? entity.portraitImageUrl : entity.portraitCroppedImageUrl || entity.portraitImageUrl;
  const portraitSize = entityType === 'character' ? 116 : 56;

  // Crop da riusare nell'anteprima del token: quello reale del Mostro (pan/
  // zoom gia' impostato nel tab Avatar), identita' per PG/PNG la cui
  // immagine e' gia' il risultato finale di un ritaglio fatto a monte
  // (react-easy-crop in ImageCropUploadModal, non un crop live riapplicabile
  // - vedi indagine sul Token Studio).
  const tokenPreviewCrop: ImageCrop =
    entityType === 'monster' ? entity.portraitCrop ?? { x: 0, y: 0, scale: 1 } : { x: 0, y: 0, scale: 1 };

  return (
    <>
    {tabs.draggedTabId && <div className="fixed inset-0 z-[9999] cursor-grabbing" />}
    <div className="flex overflow-hidden rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)]">
      <div className="min-w-0 flex-1 p-5">
        <div className={!canEdit ? 'opacity-90' : ''}>
          <div className="mb-4 flex items-start gap-4">
            <DraggablePortrait
              url={portraitUrl}
              fallbackIcon={fallbackIcon}
              size={portraitSize}
              draggable={draggable}
              onDragStart={onDragStart}
              hiddenFromPlayers={entityType !== 'character' ? !entity.visibleToPlayers : undefined}
            />

            {entityType === 'character' ? (
              <div className="min-w-0 flex-1 space-y-1">
                <input
                  type="text"
                  value={entity.name}
                  onChange={(e) => onUpdate({ ...entity, name: e.target.value })}
                  disabled={!canEdit}
                  className="w-full rounded-lg border border-transparent bg-transparent px-1 text-xl font-semibold text-[var(--dash-text-strong)] outline-none transition-colors hover:border-[var(--dash-border-soft)] focus:border-[var(--dash-accent)] disabled:cursor-not-allowed"
                />
                <p className="px-1 text-sm text-[var(--dash-muted)]">
                  {entity.style} · {entity.viaggio}
                </p>
                <input
                  type="text"
                  value={entity.description ?? ''}
                  onChange={(e) => onUpdate({ ...entity, description: e.target.value })}
                  disabled={!canEdit}
                  placeholder="Breve descrizione del personaggio"
                  className="w-full rounded-lg border border-transparent bg-transparent px-1 text-sm text-[var(--dash-text)] outline-none transition-colors hover:border-[var(--dash-border-soft)] focus:border-[var(--dash-accent)] disabled:cursor-not-allowed"
                />
                {showOwnerRow && (
                  <div className="flex items-center gap-2 pt-1">
                    <div className="h-6 w-6 shrink-0 overflow-hidden rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-input)]">
                      {entity.ownerAvatarUrl ? (
                        <img src={entity.ownerAvatarUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center"><User className="h-3.5 w-3.5 text-[var(--dash-accent-2)]" /></div>
                      )}
                    </div>
                    <span className="text-xs text-[var(--dash-muted)]">
                      {entity.ownerDisplayName || 'Giocatore sconosciuto'}
                    </span>
                  </div>
                )}
              </div>
            ) : entityType === 'npc' ? (
              <div className="min-w-0 flex-1 space-y-1">
                <input
                  type="text"
                  value={entity.name}
                  onChange={(e) => onUpdate({ ...entity, name: e.target.value })}
                  disabled={!canEdit}
                  placeholder="Nome del PNG"
                  className="w-full rounded-lg border border-transparent bg-transparent px-1 text-xl font-semibold text-[var(--dash-text-strong)] outline-none transition-colors hover:border-[var(--dash-border-soft)] focus:border-[var(--dash-accent)] disabled:cursor-not-allowed"
                />
                <input
                  type="text"
                  value={entity.role ?? ''}
                  onChange={(e) => onUpdate({ ...entity, role: e.target.value })}
                  disabled={!canEdit}
                  placeholder="Ruolo"
                  className="w-full rounded-lg border border-transparent bg-transparent px-1 text-sm text-[var(--dash-muted)] outline-none transition-colors hover:border-[var(--dash-border-soft)] focus:border-[var(--dash-accent)] disabled:cursor-not-allowed"
                />
              </div>
            ) : (
              <div className="min-w-0 flex-1">
                <input
                  type="text"
                  value={entity.name}
                  onChange={(e) => onUpdate({ ...entity, name: e.target.value })}
                  disabled={!canEdit}
                  placeholder="Nome del Mostro"
                  className="w-full rounded-lg border border-transparent bg-transparent px-1 text-xl font-semibold text-[var(--dash-text-strong)] outline-none transition-colors hover:border-[var(--dash-border-soft)] focus:border-[var(--dash-accent)] disabled:cursor-not-allowed"
                />
              </div>
            )}

            {headerAction}
          </div>

          <div className="mb-4">
            <RulesetTag rulesetId={entity.ruleset ?? 'hsc'} />
          </div>

          {!canEdit && (
            <div className="mb-4 rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-2 text-xs text-[var(--dash-muted)]">
              {entityType === 'character'
                ? 'Puoi visualizzare questo personaggio ma non modificarlo.'
                : 'Puoi visualizzare questa scheda ma non modificarla.'}
            </div>
          )}
        </div>

        {activeSection === 'scheda' && (
        <>
        <EntityTabBar canEdit={canEdit} tabs={tabs} lockedTabId={campaignId ? 'origins' : null} />

        <fieldset disabled={!canEdit} className={!canEdit ? 'opacity-90' : ''}>
          {entityType === 'character' && tabs.currentTab === 'summary' && isHSC && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-2">
                {(['Fisico', 'Scuola', 'Carisma', 'Strada'] as const).map((ambito) => {
                  const value = (entity.ambiti as any)[ambito];
                  const isExpanded = expandedAmbito === ambito;
                  return (
                    <div
                      key={ambito}
                      role="button"
                      tabIndex={0}
                      onClick={() => setExpandedAmbito(isExpanded ? null : ambito)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpandedAmbito(isExpanded ? null : ambito); }}
                      className={`cursor-pointer rounded-lg border-2 px-1.5 py-2 text-center transition-colors ${
                        isExpanded
                          ? 'border-[var(--dash-accent)] bg-[var(--dash-surface-2)]'
                          : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] hover:border-[var(--dash-accent)]'
                      }`}
                    >
                      <div className="truncate text-[10px] uppercase tracking-[0.05em] text-[var(--dash-accent-2)]">{ambito}</div>
                      <div className="mt-0.5 flex items-center justify-between gap-1">
                        <button
                          type="button"
                          tabIndex={canEdit ? 0 : -1}
                          onClick={(e) => {
                            e.stopPropagation();
                            updateAmbito(ambito, -1);
                          }}
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] text-xs text-[var(--dash-text-strong)] hover:bg-[var(--dash-panel)] ${
                            canEdit ? '' : 'invisible'
                          }`}
                        >
                          −
                        </button>
                        <span className="text-lg font-semibold text-[var(--dash-text-strong)]">{value}</span>
                        <button
                          type="button"
                          tabIndex={canEdit ? 0 : -1}
                          onClick={(e) => {
                            e.stopPropagation();
                            updateAmbito(ambito, 1);
                          }}
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[var(--dash-accent)] bg-[var(--dash-accent)] text-xs text-[var(--dash-text-strong)] hover:bg-[var(--dash-accent-2)] ${
                            canEdit ? '' : 'invisible'
                          }`}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {expandedAmbito && (
                <div className="rounded-xl border-2 border-[var(--dash-accent)] bg-[var(--dash-panel)] p-4">
                  <div className="mb-3 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
                    Abilità · {expandedAmbito}
                  </div>
                  <div className="space-y-2.5">
                    {ABILITA_PER_AMBITO[expandedAmbito].map((abilita) => {
                      const currentValue = (entity.abilita as any)?.[abilita] ?? 1;
                      return (
                        <div key={abilita} className="flex items-center justify-between">
                          <span className="text-sm text-[var(--dash-text)]">{abilita}</span>
                          <AbilitaDots
                            value={currentValue}
                            disabled={!canEdit}
                            onChange={(v) => onUpdate({
                              ...entity,
                              abilita: { ...entity.abilita, [abilita]: v },
                            })}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="rounded-xl border-2 border-red-900/60 bg-red-950/20 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.08em] text-red-500/80">
                    <Heart className="h-4 w-4 text-red-500" />
                    Freschezza
                  </div>
                  <span className="text-xs text-red-200/60">{entity.freschezza} / {entity.maxFreschezza}</span>
                </div>
                <FrischezzaTracker
                  current={entity.freschezza}
                  max={entity.maxFreschezza}
                  crucialBoxes={entity.caselleFrischezzaCruciali}
                  onUpdate={(value) => onUpdate({ ...entity, freschezza: value })}
                />
              </div>
              <div className="rounded-xl border-2 border-purple-900/60 bg-purple-950/20 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.08em] text-purple-400/80">
                    <Brain className="h-4 w-4 text-purple-400" />
                    Spirale della Follia
                  </div>
                  <span className="text-xs text-purple-200/60">{entity.follia} / {entity.maxFollia}</span>
                </div>
                <FoliaSpiral current={entity.follia} max={entity.maxFollia} onUpdate={(value) => onUpdate({ ...entity, follia: value })} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border-2 border-yellow-900/60 bg-yellow-950/20 p-3">
                  <div className="mb-2 text-xs uppercase tracking-[0.08em] text-yellow-500/80">Audacia</div>
                  <StarRating
                    value={typeof entity.audacia === 'number' ? entity.audacia : 1}
                    max={6}
                    disabled={!canEdit}
                    onChange={(v) => onUpdate({ ...entity, audacia: v })}
                  />
                </div>
                <div className="rounded-xl border-2 border-yellow-900/60 bg-yellow-950/20 p-3">
                  <div className="mb-2 text-xs uppercase tracking-[0.08em] text-yellow-500/80">Prodigi</div>
                  <StarRating
                    value={typeof entity.prodigi === 'number' ? entity.prodigi : 1}
                    max={2}
                    disabled={!canEdit}
                    onChange={(v) => onUpdate({ ...entity, prodigi: v })}
                  />
                </div>
              </div>
            </div>
          )}

          {entityType === 'character' && tabs.currentTab === 'conditions' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                <div className="mb-2 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Condizioni attive</div>
                <ConditionsPanel conditions={entity.conditions} onUpdate={(conditions) => onUpdate({ ...entity, conditions })} />
              </div>
              <div className="rounded-2xl border border-[var(--dash-accent)] bg-[var(--dash-panel)] p-4">
                <div className="mb-2 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Turbe mentali</div>
                <TurbePanel turbe={entity.turbe} onUpdate={(turbe) => onUpdate({ ...entity, turbe })} />
              </div>
            </div>
          )}

          {entityType === 'character' && tabs.currentTab === 'equipment' && (
            <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
              <LegacyEquipmentPanel equipment={entity.equipment} onUpdate={(equipment) => onUpdate({ ...entity, equipment })} />
            </div>
          )}

          {entityType === 'character' && tabs.currentTab === 'origins' && (
            <div className="space-y-4">
              {!!campaignId && (
                <div className="flex items-center gap-2 rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-2 text-xs text-[var(--dash-muted)]">
                  <Lock className="h-3.5 w-3.5 shrink-0" />
                  Il personaggio è assegnato a una campagna: Origini è di sola lettura. Rimuovilo dalla campagna per modificarla.
                </div>
              )}

              {originsWarning && (
                <div className="rounded-lg border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] px-3 py-2 text-xs text-[var(--dash-danger-text)]">
                  {originsWarning}
                </div>
              )}

              <fieldset disabled={isOriginsLocked} className={isOriginsLocked ? 'space-y-4 opacity-90' : 'space-y-4'}>
                <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                  <div className="mb-3 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Stile</div>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(VIAGGI_PER_STILE) as Stile[]).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => requestOriginChange(st, VIAGGI_PER_STILE[st][0], 'style')}
                        className={originToggleClass(entity.style === st)}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                  <div className="mb-3 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Viaggio</div>
                  <div className="flex flex-wrap gap-2">
                    {VIAGGI_PER_STILE[entity.style as Stile].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => requestOriginChange(entity.style, v, 'viaggio')}
                        className={originToggleClass(entity.viaggio === v)}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                  <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Tratti</div>
                  <p className="mb-3 text-[11px] text-[var(--dash-muted)]">Seleziona 1 tratto di Stile e 2 tratti di Viaggio.</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <div className="mb-2 text-[11px] uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Tratto di Stile</div>
                      <div className="space-y-2">
                        {STYLE_TRAITS[entity.style as Stile].map((trait) => (
                          <button
                            key={trait.name}
                            type="button"
                            onClick={() => selectStyleTrait(trait)}
                            className={traitOptionClass(currentStyleTrait?.name === trait.name)}
                          >
                            <div className="font-medium text-[var(--dash-text-strong)]">{trait.name}</div>
                            <div className="text-xs text-[var(--dash-text)]">{trait.description}</div>
                            <div className="mt-1 text-xs text-[var(--dash-accent-2)]">{trait.benefit}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="mb-2 text-[11px] uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
                        Tratti di Viaggio · {currentJourneyTraits.length} / 2
                      </div>
                      <div className="space-y-2">
                        {JOURNEY_TRAITS[entity.viaggio as Viaggio].map((trait) => (
                          <button
                            key={trait.name}
                            type="button"
                            onClick={() => toggleJourneyTrait(trait)}
                            className={traitOptionClass(currentJourneyTraits.some(t => t.name === trait.name))}
                          >
                            <div className="font-medium text-[var(--dash-text-strong)]">{trait.name}</div>
                            <div className="text-xs text-[var(--dash-text)]">{trait.description}</div>
                            <div className="mt-1 text-xs text-[var(--dash-accent-2)]">{trait.benefit}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </fieldset>

              {pendingOrigin && (
                <ConfirmDialog
                  title={`Confermare il cambio di ${pendingOriginFieldLabel}?`}
                  message={`Stai per cambiare ${pendingOriginFieldLabel} in "${pendingOriginValueLabel}". Gli Ambiti verranno ricalcolati automaticamente. Le Abilità nella tab "Riepilogo" NON vengono ricalcolate automaticamente: dopo questa modifica i bonus derivati dal vecchio ${pendingOriginFieldLabel} potrebbero non essere più corretti e dovrai rivederle e sistemarle a mano. Se i Tratti selezionati non sono compatibili con la nuova scelta, verranno azzerati e dovrai riselezionarli.`}
                  confirmLabel={`Ho capito, cambia ${pendingOriginFieldLabel}`}
                  cancelLabel="Annulla"
                  danger={false}
                  onConfirm={() => {
                    applyOriginChange(pendingOrigin.style, pendingOrigin.viaggio);
                    setPendingOrigin(null);
                  }}
                  onCancel={() => setPendingOrigin(null)}
                />
              )}
            </div>
          )}

          {entityType === 'character' && tabs.currentTab === 'storia' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                <div className="mb-3 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Storia</div>
                <textarea
                  value={entity.notes ?? ''}
                  onChange={(e) => onUpdate({ ...entity, notes: e.target.value })}
                  placeholder="Scrivi qui il background, dettagli importanti, relazioni, paure, motivazioni..."
                  rows={8}
                  className="w-full resize-none rounded-xl border border-[var(--dash-border)] bg-[var(--dash-input)] px-4 py-3 text-sm text-[var(--dash-text-strong)] placeholder-[var(--dash-muted)] outline-none focus:border-[var(--dash-accent)] disabled:cursor-not-allowed disabled:opacity-70"
                />
              </div>

              <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                <div className="mb-3 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Legame</div>
                <label className="mb-1.5 block text-[11px] uppercase tracking-[0.08em] text-[var(--dash-muted)]">
                  Personaggio collegato
                </label>
                <select
                  value={legameSelectValue}
                  onChange={(e) => handleLegameSelectChange(e.target.value)}
                  className="mb-3 w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-sm text-[var(--dash-text-strong)] outline-none focus:border-[var(--dash-accent)] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <option value="">— Nessuno / testo libero —</option>
                  <option value="LATER">Da definire in seguito</option>
                  {legamePool.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>

                {entity.linkedCharacterId ? (
                  <>
                    <label className="mb-1.5 block text-[11px] uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
                      Descrizione del legame
                    </label>
                    <input
                      type="text"
                      value={entity.legameDescription ?? ''}
                      onChange={(e) => onUpdate({ ...entity, legameDescription: e.target.value, legame: 'Legame con personaggio' })}
                      placeholder="Es. Fratello maggiore, migliore amica, rivale..."
                      className="w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-sm text-[var(--dash-text-strong)] outline-none focus:border-[var(--dash-accent)] disabled:cursor-not-allowed disabled:opacity-70"
                    />
                  </>
                ) : entity.legame === LATER_SENTINEL ? (
                  <div className="rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-3 py-2 text-xs text-[var(--dash-text)]">
                    Questo legame verrà gestito in un secondo momento.
                  </div>
                ) : (
                  <input
                    type="text"
                    value={entity.legame ?? ''}
                    onChange={(e) => onUpdate({ ...entity, legame: e.target.value })}
                    placeholder="Descrivi liberamente il legame, oppure seleziona un personaggio sopra"
                    className="w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-sm text-[var(--dash-text-strong)] outline-none focus:border-[var(--dash-accent)] disabled:cursor-not-allowed disabled:opacity-70"
                  />
                )}

                {legamePool.length === 0 && (
                  <p className="mt-2 text-[11px] text-[var(--dash-muted)]">
                    {campaignId
                      ? 'Nessun altro PG in questa campagna a cui collegarsi.'
                      : 'Nessun altro personaggio disponibile: solo tuoi personaggi non ancora assegnati a una campagna possono essere collegati qui.'}
                    {' '}Il Legame resta comunque sempre concettualmente tra Personaggi giocanti, mai verso PNG.
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                <div className="mb-3 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Tutore</div>
                <div className="mb-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => { setTutoreInputTypeOverride('custom'); if (tutoreInputType === 'later') onUpdate({ ...entity, tutore: '' }); }} className={originToggleClass(tutoreInputType === 'custom')}>
                    Inserimento libero
                  </button>
                  <button type="button" onClick={() => { setTutoreInputTypeOverride('notable'); if (tutoreInputType === 'later') onUpdate({ ...entity, tutore: '' }); }} className={originToggleClass(tutoreInputType === 'notable')}>
                    Abitanti degni di nota
                  </button>
                  {campaignId && (
                    <button type="button" onClick={() => { setTutoreInputTypeOverride('npc'); if (tutoreInputType === 'later') onUpdate({ ...entity, tutore: '' }); }} className={originToggleClass(tutoreInputType === 'npc')}>
                      PNG della campagna
                    </button>
                  )}
                  <button type="button" onClick={() => { setTutoreInputTypeOverride('later'); onUpdate({ ...entity, tutore: LATER_SENTINEL }); }} className={originToggleClass(tutoreInputType === 'later')}>
                    Seleziona in seguito
                  </button>
                </div>
                {tutoreInputType === 'custom' ? (
                  <input
                    type="text"
                    value={entity.tutore ?? ''}
                    onChange={(e) => onUpdate({ ...entity, tutore: e.target.value })}
                    placeholder="Es. Professor Armitage"
                    className="w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-sm text-[var(--dash-text-strong)] outline-none focus:border-[var(--dash-accent)] disabled:cursor-not-allowed disabled:opacity-70"
                  />
                ) : tutoreInputType === 'notable' ? (
                  <select
                    value={entity.tutore ?? ''}
                    onChange={(e) => onUpdate({ ...entity, tutore: e.target.value })}
                    className="w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-sm text-[var(--dash-text-strong)] outline-none focus:border-[var(--dash-accent)] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <option value="">Seleziona un abitante</option>
                    {NOTABLE_CITIZENS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                ) : tutoreInputType === 'npc' ? (
                  <select
                    value={entity.tutore ?? ''}
                    onChange={(e) => onUpdate({ ...entity, tutore: e.target.value })}
                    className="w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-sm text-[var(--dash-text-strong)] outline-none focus:border-[var(--dash-accent)] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <option value="">Seleziona un PNG</option>
                    {campaignNpcs.map((npc) => (
                      <option key={npc.id} value={npc.name}>{npc.name}</option>
                    ))}
                  </select>
                ) : (
                  <div className="rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-3 py-2 text-xs text-[var(--dash-text)]">
                    Il Tutore verrà deciso tra i PNG della Campagna.
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                <div className="mb-3 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Tipo Speciale</div>
                <div className="mb-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => { setTipoSpecialeInputTypeOverride('custom'); if (tipoSpecialeInputType === 'later') onUpdate({ ...entity, tipoSpeciale: '' }); }} className={originToggleClass(tipoSpecialeInputType === 'custom')}>
                    Inserimento libero
                  </button>
                  <button type="button" onClick={() => { setTipoSpecialeInputTypeOverride('notable'); if (tipoSpecialeInputType === 'later') onUpdate({ ...entity, tipoSpeciale: '' }); }} className={originToggleClass(tipoSpecialeInputType === 'notable')}>
                    Abitanti degni di nota
                  </button>
                  {campaignId && (
                    <button type="button" onClick={() => { setTipoSpecialeInputTypeOverride('npc'); if (tipoSpecialeInputType === 'later') onUpdate({ ...entity, tipoSpeciale: '' }); }} className={originToggleClass(tipoSpecialeInputType === 'npc')}>
                      PNG della campagna
                    </button>
                  )}
                  <button type="button" onClick={() => { setTipoSpecialeInputTypeOverride('later'); onUpdate({ ...entity, tipoSpeciale: LATER_SENTINEL }); }} className={originToggleClass(tipoSpecialeInputType === 'later')}>
                    Seleziona in seguito
                  </button>
                </div>
                {tipoSpecialeInputType === 'custom' ? (
                  <input
                    type="text"
                    value={entity.tipoSpeciale ?? ''}
                    onChange={(e) => onUpdate({ ...entity, tipoSpeciale: e.target.value })}
                    placeholder="Es. Abigail Prinn"
                    className="w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-sm text-[var(--dash-text-strong)] outline-none focus:border-[var(--dash-accent)] disabled:cursor-not-allowed disabled:opacity-70"
                  />
                ) : tipoSpecialeInputType === 'notable' ? (
                  <select
                    value={entity.tipoSpeciale ?? ''}
                    onChange={(e) => onUpdate({ ...entity, tipoSpeciale: e.target.value })}
                    className="w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-sm text-[var(--dash-text-strong)] outline-none focus:border-[var(--dash-accent)] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <option value="">Seleziona un cittadino</option>
                    {NOTABLE_CITIZENS.filter((c) => c !== entity.tutore).map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                ) : tipoSpecialeInputType === 'npc' ? (
                  <select
                    value={entity.tipoSpeciale ?? ''}
                    onChange={(e) => onUpdate({ ...entity, tipoSpeciale: e.target.value })}
                    className="w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-sm text-[var(--dash-text-strong)] outline-none focus:border-[var(--dash-accent)] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <option value="">Seleziona un PNG</option>
                    {campaignNpcs.filter(n => n.name !== entity.tutore).map((npc) => (
                      <option key={npc.id} value={npc.name}>{npc.name}</option>
                    ))}
                  </select>
                ) : (
                  <div className="rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-3 py-2 text-xs text-[var(--dash-text)]">
                    Il Tipo Speciale verrà deciso tra i PNG della Campagna.
                  </div>
                )}
              </div>
            </div>
          )}

          {entityType === 'npc' && tabs.currentTab === 'summary' && (
            <div className="space-y-3 text-sm">
              {!!campaignId && (
                <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                  <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Ambito narrativo</div>
                  <select
                    value={entity.adventureId ?? ''}
                    onChange={(e) => onUpdate({ ...entity, adventureId: e.target.value || null })}
                    className="w-full rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-input)] px-2 py-1.5 text-sm text-[var(--dash-text-strong)] outline-none focus:border-[var(--dash-accent)]"
                  >
                    <option value="">Tutta la campagna</option>
                    {campaignAdventures.map((adventure) => (
                      <option key={adventure.id} value={adventure.id}>{adventure.title}</option>
                    ))}
                  </select>
                </div>
              )}

              {!!campaignId && (
                <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                  <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Luogo</div>
                  <select
                    value={entity.environmentId ?? ''}
                    onChange={(e) => onUpdate({ ...entity, environmentId: e.target.value || null })}
                    className="w-full rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-input)] px-2 py-1.5 text-sm text-[var(--dash-text-strong)] outline-none focus:border-[var(--dash-accent)]"
                  >
                    <option value="">Nessun luogo</option>
                    {campaignEnvironments
                      .filter((environment) => !entity.adventureId || environment.adventureId == null || environment.adventureId === entity.adventureId)
                      .map((environment) => (
                        <option key={environment.id} value={environment.id}>{environment.name}</option>
                      ))}
                  </select>
                </div>
              )}

              {!!campaignId && isHSC && (
                <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                  <div className="mb-2 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Freschezza massima</div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const nextMax = Math.max(0, (entity.maxFreschezza ?? 0) - 1);
                        onUpdate({
                          ...entity,
                          maxFreschezza: nextMax,
                          freschezza: nextMax,
                          caselleFrischezzaCruciali: (entity.caselleFrischezzaCruciali ?? []).filter((box: number) => box <= nextMax),
                        });
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] text-[var(--dash-text-strong)] hover:bg-[var(--dash-surface-2)]"
                    >
                      −
                    </button>
                    <div className="flex h-8 w-14 items-center justify-center rounded border border-[var(--dash-border)] bg-[var(--dash-input)] text-center text-sm text-[var(--dash-text)]">
                      {entity.maxFreschezza ?? 0}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const nextMax = (entity.maxFreschezza ?? 0) + 1;
                        onUpdate({ ...entity, maxFreschezza: nextMax, freschezza: nextMax });
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--dash-accent)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)] hover:bg-[var(--dash-accent-2)]"
                    >
                      +
                    </button>
                  </div>
                </div>
              )}

              {!!campaignId && isHSC && (entity.maxFreschezza ?? 0) > 0 && (
                <FreschezzaBoxesEditor
                  current={entity.freschezza ?? entity.maxFreschezza ?? 0}
                  max={entity.maxFreschezza ?? 0}
                  crucialBoxes={entity.caselleFrischezzaCruciali ?? []}
                  onUpdate={({ current, crucialBoxes }) => onUpdate({ ...entity, freschezza: current, caselleFrischezzaCruciali: crucialBoxes })}
                />
              )}

              {!!campaignId && isHSC && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-3 py-2">
                    <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Attacco</div>
                    <select
                      value={entity.attacco ?? ''}
                      onChange={(e) => onUpdate({ ...entity, attacco: e.target.value })}
                      className="w-full rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-input)] px-2 py-1 text-sm text-[var(--dash-text-strong)] outline-none focus:border-[var(--dash-accent)]"
                    >
                      {DIFFICULTY_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option || 'Non definito'}</option>
                      ))}
                    </select>
                  </div>
                  <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-3 py-2">
                    <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Difesa</div>
                    <select
                      value={entity.difesa ?? ''}
                      onChange={(e) => onUpdate({ ...entity, difesa: e.target.value })}
                      className="w-full rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-input)] px-2 py-1 text-sm text-[var(--dash-text-strong)] outline-none focus:border-[var(--dash-accent)]"
                    >
                      {DIFFICULTY_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option || 'Non definita'}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {!!campaignId && isHSC && (
                <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                  <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Punto debole</div>
                  <textarea
                    value={entity.puntoDebole ?? ''}
                    onChange={(e) => onUpdate({ ...entity, puntoDebole: e.target.value })}
                    placeholder="Punto debole"
                    rows={2}
                    className="w-full resize-none rounded-lg border border-transparent bg-transparent text-[var(--dash-text)] outline-none transition-colors hover:border-[var(--dash-border-soft)] focus:border-[var(--dash-accent)] disabled:cursor-not-allowed"
                  />
                </div>
              )}

              {!!campaignId && isD20 && (
                <D20StatBlock
                  stats={entity.d20Stats ?? DEFAULT_D20_STATS}
                  isPlayerCharacter={false}
                  isEditing={canEdit}
                  onChange={(patch) => onUpdate({ ...entity, d20Stats: { ...(entity.d20Stats ?? DEFAULT_D20_STATS), ...patch } })}
                />
              )}

              <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Descrizione</div>
                <textarea
                  value={entity.description ?? ''}
                  onChange={(e) => onUpdate({ ...entity, description: e.target.value })}
                  placeholder="Descrivi questo PNG..."
                  rows={3}
                  className="w-full resize-none rounded-lg border border-transparent bg-transparent text-[var(--dash-text)] outline-none transition-colors hover:border-[var(--dash-border-soft)] focus:border-[var(--dash-accent)] disabled:cursor-not-allowed"
                />
              </div>
              <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Personalità</div>
                <textarea
                  value={entity.personality ?? ''}
                  onChange={(e) => onUpdate({ ...entity, personality: e.target.value })}
                  placeholder="Tratti di personalità..."
                  rows={3}
                  className="w-full resize-none rounded-lg border border-transparent bg-transparent text-[var(--dash-text)] outline-none transition-colors hover:border-[var(--dash-border-soft)] focus:border-[var(--dash-accent)] disabled:cursor-not-allowed"
                />
              </div>
              {canEdit && (
                <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                  <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Segreti (solo GM)</div>
                  <textarea
                    value={entity.secrets ?? ''}
                    onChange={(e) => onUpdate({ ...entity, secrets: e.target.value })}
                    placeholder="Informazioni riservate al GM..."
                    rows={3}
                    className="w-full resize-none rounded-lg border border-transparent bg-transparent text-[var(--dash-text)] outline-none transition-colors hover:border-[var(--dash-border-soft)] focus:border-[var(--dash-accent)] disabled:cursor-not-allowed"
                  />
                </div>
              )}
              <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Posizione</div>
                <input
                  type="text"
                  value={entity.location ?? ''}
                  onChange={(e) => onUpdate({ ...entity, location: e.target.value })}
                  placeholder="Dove si trova ora..."
                  className="w-full rounded-lg border border-transparent bg-transparent text-[var(--dash-text)] outline-none transition-colors hover:border-[var(--dash-border-soft)] focus:border-[var(--dash-accent)] disabled:cursor-not-allowed"
                />
              </div>
            </div>
          )}

          {entityType === 'monster' && tabs.currentTab === 'summary' && (
            <div className="space-y-3 text-sm">
              {!!campaignId && (
                <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                  <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Ambito narrativo</div>
                  <select
                    value={entity.adventureId ?? ''}
                    onChange={(e) => onUpdate({ ...entity, adventureId: e.target.value || null, environmentId: null })}
                    className="w-full rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-input)] px-2 py-1.5 text-sm text-[var(--dash-text-strong)] outline-none focus:border-[var(--dash-accent)]"
                  >
                    <option value="">Tutta la campagna</option>
                    {campaignAdventures.map((adventure) => (
                      <option key={adventure.id} value={adventure.id}>{adventure.title}</option>
                    ))}
                  </select>
                </div>
              )}

              {!!campaignId && (
                <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                  <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Luogo</div>
                  <select
                    value={entity.environmentId ?? ''}
                    onChange={(e) => onUpdate({ ...entity, environmentId: e.target.value || null })}
                    className="w-full rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-input)] px-2 py-1.5 text-sm text-[var(--dash-text-strong)] outline-none focus:border-[var(--dash-accent)]"
                  >
                    <option value="">Nessun luogo</option>
                    {campaignEnvironments
                      .filter((environment) => !entity.adventureId || environment.adventureId == null || environment.adventureId === entity.adventureId)
                      .map((environment) => (
                        <option key={environment.id} value={environment.id}>{environment.name}</option>
                      ))}
                  </select>
                </div>
              )}

              <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Descrizione</div>
                <textarea
                  value={entity.description ?? ''}
                  onChange={(e) => onUpdate({ ...entity, description: e.target.value })}
                  placeholder="Descrivi questo mostro..."
                  rows={3}
                  className="w-full resize-none rounded-lg border border-transparent bg-transparent text-[var(--dash-text)] outline-none transition-colors hover:border-[var(--dash-border-soft)] focus:border-[var(--dash-accent)] disabled:cursor-not-allowed"
                />
              </div>

              <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                <div className="mb-2 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Freschezza massima</div>
                <FreschezzaMaxEditor monster={entity} onUpdate={onUpdate} />
              </div>

              {(entity.maxFreschezza ?? 0) > 0 && (
                <MonsterFreschezzaBoxesEditor
                  current={entity.freschezza ?? 0}
                  max={entity.maxFreschezza ?? 0}
                  criticalBoxes={getMonsterCriticalBoxes(entity)}
                  hasCriticalBoxes={(entity.maxFreschezza ?? 0) > 0}
                  allowCriticalEditing
                  allowFreshnessEditing
                  onUpdate={({ current, criticalBoxes }) => {
                    const nextMonster = { ...entity, caselleFreschezzaCritiche: criticalBoxes };
                    const audaciaGain = calculateAudaciaGainFromFreshnessChange(nextMonster, entity.freschezza ?? 0, current);
                    onUpdate({
                      ...nextMonster,
                      freschezza: current,
                      audacia: clampMonsterAudacia(nextMonster, (nextMonster.audacia ?? 0) + audaciaGain),
                    });
                  }}
                />
              )}

              <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Audacia</div>
                  <span className="text-sm font-semibold text-[var(--dash-text-strong)]">{entity.audacia ?? 0}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onUpdate({ ...entity, audacia: clampMonsterAudacia(entity, (entity.audacia ?? 0) - 1) })}
                    className="rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] px-3 py-1.5 text-sm text-[var(--dash-text-strong)] hover:bg-[var(--dash-surface-2)]"
                  >
                    −1
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdate({ ...entity, audacia: clampMonsterAudacia(entity, (entity.audacia ?? 0) + 1) })}
                    className="rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] px-3 py-1.5 text-sm text-[var(--dash-text-strong)] hover:bg-[var(--dash-surface-2)]"
                  >
                    +1
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-3 py-2">
                  <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Attacco</div>
                  <select
                    value={entity.attacco ?? ''}
                    onChange={(e) => onUpdate({ ...entity, attacco: e.target.value })}
                    className="w-full rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-input)] px-2 py-1 text-sm text-[var(--dash-text-strong)] outline-none focus:border-[var(--dash-accent)]"
                  >
                    {DIFFICULTY_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option || 'Non definito'}</option>
                    ))}
                  </select>
                </div>
                <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-3 py-2">
                  <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Difesa</div>
                  <select
                    value={entity.difesa ?? ''}
                    onChange={(e) => onUpdate({ ...entity, difesa: e.target.value })}
                    className="w-full rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-input)] px-2 py-1 text-sm text-[var(--dash-text-strong)] outline-none focus:border-[var(--dash-accent)]"
                  >
                    {DIFFICULTY_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option || 'Non definita'}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Punto debole</div>
                <textarea
                  value={entity.puntoDebole ?? ''}
                  onChange={(e) => onUpdate({ ...entity, puntoDebole: e.target.value })}
                  placeholder="Punto debole"
                  rows={2}
                  className="w-full resize-none rounded-lg border border-transparent bg-transparent text-[var(--dash-text)] outline-none transition-colors hover:border-[var(--dash-border-soft)] focus:border-[var(--dash-accent)] disabled:cursor-not-allowed"
                />
              </div>

              <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Note GM</div>
                <textarea
                  value={entity.notes ?? ''}
                  onChange={(e) => onUpdate({ ...entity, notes: e.target.value })}
                  placeholder="Note GM"
                  rows={2}
                  className="w-full resize-none rounded-lg border border-transparent bg-transparent text-[var(--dash-text)] outline-none transition-colors hover:border-[var(--dash-border-soft)] focus:border-[var(--dash-accent)] disabled:cursor-not-allowed"
                />
              </div>

              <CatalogSelectionBlock
                title="Tratti"
                items={MONSTER_TRAITS_CATALOG}
                selectedIds={entity.traitIds ?? []}
                onToggle={(traitId) => {
                  // CatalogSelectionBlock usa <div role="button">, non un
                  // controllo form nativo: <fieldset disabled> non lo disabilita
                  // da solo, serve il guard esplicito qui.
                  if (!canEdit) return;
                  const currentTraitIds: string[] = entity.traitIds ?? [];
                  const isRemoving = currentTraitIds.includes(traitId);
                  const nextTraitIds = isRemoving
                    ? currentTraitIds.filter((id: string) => id !== traitId)
                    : [...currentTraitIds, traitId];
                  const nextMonster = { ...entity, traitIds: nextTraitIds };
                  onUpdate({
                    ...nextMonster,
                    tiroFollia:
                      traitId === TERRIFYING_TRAIT_ID
                        ? isRemoving
                          ? null
                          : normalizeTiroFollia(nextMonster) ?? 'Base'
                        : entity.tiroFollia,
                  });
                }}
                extraContent={(item, selected) =>
                  item.id === TERRIFYING_TRAIT_ID && selected ? (
                    <select
                      value={entity.tiroFollia ?? 'Base'}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => {
                        event.stopPropagation();
                        onUpdate({ ...entity, tiroFollia: event.target.value });
                      }}
                      className="mt-3 h-8 w-full max-w-[220px] rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-input)] px-2 text-xs font-medium text-[var(--dash-text)] outline-none transition-colors focus:border-[var(--dash-accent)]"
                      aria-label="Difficoltà Tiro Follia"
                    >
                      {FOLLIA_DIFFICULTY_OPTIONS.map((option) => (
                        <option key={option} value={option}>Tiro Follia {option}</option>
                      ))}
                    </select>
                  ) : null
                }
              />

              <CustomEntriesEditor
                title="Tratti personalizzati"
                items={entity.customTraits ?? []}
                onAdd={() => onUpdate({ ...entity, customTraits: [...(entity.customTraits ?? []), { id: generateMonsterEntryId('trait'), name: '', description: '' }] })}
                onUpdate={(id, patch) => onUpdate({ ...entity, customTraits: (entity.customTraits ?? []).map((item: any) => (item.id === id ? { ...item, ...patch } : item)) })}
                onRemove={(id) => onUpdate({ ...entity, customTraits: (entity.customTraits ?? []).filter((item: any) => item.id !== id) })}
              />

              <CatalogSelectionBlock
                title="Azioni speciali"
                items={MONSTER_SPECIAL_ACTIONS_CATALOG}
                selectedIds={entity.specialActionIds ?? []}
                onToggle={(actionId) => {
                  if (!canEdit) return;
                  const currentActionIds: string[] = entity.specialActionIds ?? [];
                  const nextActionIds = currentActionIds.includes(actionId)
                    ? currentActionIds.filter((id: string) => id !== actionId)
                    : [...currentActionIds, actionId];
                  onUpdate({ ...entity, specialActionIds: nextActionIds });
                }}
              />

              <CustomEntriesEditor
                title="Azioni speciali personalizzate"
                items={entity.customSpecialActions ?? []}
                onAdd={() => onUpdate({ ...entity, customSpecialActions: [...(entity.customSpecialActions ?? []), { id: generateMonsterEntryId('action'), name: '', description: '' }] })}
                onUpdate={(id, patch) => onUpdate({ ...entity, customSpecialActions: (entity.customSpecialActions ?? []).map((item: any) => (item.id === id ? { ...item, ...patch } : item)) })}
                onRemove={(id) => onUpdate({ ...entity, customSpecialActions: (entity.customSpecialActions ?? []).filter((item: any) => item.id !== id) })}
              />
            </div>
          )}

          {tabs.customTabs.map(tab =>
            tabs.currentTab === tab.id && (canEdit || !tab.hidden) ? (
              <textarea
                key={tab.id}
                value={tab.content}
                onChange={(e) => tabs.handleCustomTabContentChange(tab.id, e.target.value)}
                disabled={!canEdit}
                placeholder="Scrivi qui..."
                className="h-64 w-full resize-none rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4 text-sm text-[var(--dash-text)] outline-none focus:border-[var(--dash-accent)] disabled:cursor-not-allowed disabled:opacity-70"
              />
            ) : null
          )}
        </fieldset>
        </>
        )}

        {activeSection === 'token' && (
          <fieldset disabled={!canEdit} className={!canEdit ? 'opacity-90' : ''}>
            <TokenStyleEditor
              name={entity.name}
              portraitImageUrl={portraitUrl}
              crop={tokenPreviewCrop}
              tokenColor={entity.tokenColor}
              tokenBackgroundColor={entity.tokenBackgroundColor}
              tokenBorderStyle={entity.tokenBorderStyle}
              onChange={patch => onUpdate({ ...entity, ...patch })}
            />
          </fieldset>
        )}
      </div>

      {showRail && <EntityDetailRail activeSection={activeSection} onSectionChange={setActiveSection} />}
    </div>
    </>
  );
}
