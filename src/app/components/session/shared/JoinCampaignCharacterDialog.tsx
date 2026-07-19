import { createPortal } from 'react-dom';
import { User, Sparkles, Loader2 } from 'lucide-react';
import { PALETTE_COLORS, DEFAULT_PALETTE_COLORS, type PaletteId } from '../../ui/paletteColors';
import type { RulesetId } from '../../../campaigns/campaignTypes';

function getCurrentPaletteColors() {
  const el = document.querySelector('[data-dashboard-palette]');
  const palette = el?.getAttribute('data-dashboard-palette') as PaletteId | null;
  return palette && PALETTE_COLORS[palette] ? PALETTE_COLORS[palette] : DEFAULT_PALETTE_COLORS;
}

export interface JoinCampaignCharacterOption {
  id: string;
  name: string;
  ruleset: RulesetId | null;
}

interface JoinCampaignCharacterDialogProps {
  campaignName: string;
  // I propri PG compatibili per ruleset - selezionarne uno assegna quel PG
  // alla campagna (assignCharacterToCampaign).
  ownCharacters: JoinCampaignCharacterOption[];
  // PG del GM marcati "disponibili" ("Precompilati") in questa campagna -
  // selezionarne uno lo richiede (claimCharacter), un'azione diversa sotto,
  // per questo sono due liste/callback separate e non una unica mescolata.
  availableCharacters: JoinCampaignCharacterOption[];
  isPending?: boolean;
  error?: string | null;
  onSelectOwnCharacter: (characterId: string) => void;
  onSelectAvailableCharacter: (characterId: string) => void;
  onClose: () => void;
}

// Speculare a CampaignAssignDialog.tsx (stesso linguaggio visivo, overlay
// fisso + pannello centrato + righe cliccabili con bordo/hover) ma con
// l'oggetto invertito: qui la campagna e' gia' nota (risolta da un codice
// invito o da una notifica di invito per nome), si sceglie il personaggio
// con cui unirsi - usato sia da HomeScreen.tsx sia da TopBar.tsx.
//
// createPortal verso document.body sempre, non solo un fixed inset-0 "nudo":
// in TopBar.tsx questo componente viene montato dentro il DropdownMenuContent
// di Radix, le cui classi di animazione (zoom-in-95/zoom-out-95) applicano
// un transform sul contenitore - un transform su un antenato crea un nuovo
// containing block e "intrappola" un discendente position:fixed dentro i
// suoi bordi invece di coprire tutto il viewport. Il portale bypassa
// il problema indipendentemente da dove il componente viene montato.
function CharacterRow({
  char,
  disabled,
  onSelect,
  colors,
}: {
  char: JoinCampaignCharacterOption;
  disabled: boolean;
  onSelect: (id: string) => void;
  colors: { text: string; border: string };
}) {
  return (
    <button
      key={char.id}
      type="button"
      disabled={disabled}
      onClick={() => onSelect(char.id)}
      style={{ color: colors.text, borderColor: colors.border }}
      className="flex w-full cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-all hover:opacity-75 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <User className="h-3.5 w-3.5 shrink-0" style={{ opacity: 0.7 }} />
      <span className="truncate">{char.name}</span>
    </button>
  );
}

export function JoinCampaignCharacterDialog({
  campaignName,
  ownCharacters,
  availableCharacters,
  isPending = false,
  error,
  onSelectOwnCharacter,
  onSelectAvailableCharacter,
  onClose,
}: JoinCampaignCharacterDialogProps) {
  const colors = getCurrentPaletteColors();

  return createPortal(
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ backgroundColor: colors.panel, border: `1px solid ${colors.border}` }}
        className="w-full max-w-sm rounded-2xl p-5 shadow-2xl"
      >
        <h3 className="mb-1 text-base font-semibold" style={{ color: colors.text }}>Scegli il personaggio</h3>
        <p className="mb-4 truncate text-sm" style={{ color: colors.text, opacity: 0.7 }}>{campaignName}</p>

        <div className="max-h-80 space-y-4 overflow-y-auto">
          {ownCharacters.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs uppercase tracking-[0.08em]" style={{ color: colors.text, opacity: 0.6 }}>
                I tuoi personaggi
              </p>
              <div className="space-y-1">
                {ownCharacters.map(char => (
                  <CharacterRow key={char.id} char={char} disabled={isPending} onSelect={onSelectOwnCharacter} colors={colors} />
                ))}
              </div>
            </div>
          )}

          {availableCharacters.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs uppercase tracking-[0.08em]" style={{ color: colors.text, opacity: 0.6 }}>
                <Sparkles className="h-3 w-3" /> PG disponibili da richiedere
              </p>
              <div className="space-y-1">
                {availableCharacters.map(char => (
                  <CharacterRow key={char.id} char={char} disabled={isPending} onSelect={onSelectAvailableCharacter} colors={colors} />
                ))}
              </div>
            </div>
          )}
        </div>

        {isPending && <Loader2 className="mb-2 mt-2 h-4 w-4 animate-spin" style={{ color: colors.text }} />}
        {error && <p className="mb-2 mt-2 text-xs text-red-300">{error}</p>}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            style={{ border: `1px solid ${colors.border}`, color: colors.text }}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80"
          >
            Annulla
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
