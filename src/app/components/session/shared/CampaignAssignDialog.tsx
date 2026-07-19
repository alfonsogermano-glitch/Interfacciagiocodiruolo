import { useState } from 'react';
import { MapPin, KeyRound, Loader2 } from 'lucide-react';
import { PALETTE_COLORS, DEFAULT_PALETTE_COLORS, type PaletteId } from '../../ui/paletteColors';

function getCurrentPaletteColors() {
  const el = document.querySelector('[data-dashboard-palette]');
  const palette = el?.getAttribute('data-dashboard-palette') as PaletteId | null;
  return palette && PALETTE_COLORS[palette] ? PALETTE_COLORS[palette] : DEFAULT_PALETTE_COLORS;
}

export interface CampaignAssignDialogOption {
  id: string;
  name: string;
  suffix?: string;
}

interface CampaignAssignDialogProps {
  entityName: string;
  campaigns: CampaignAssignDialogOption[];
  // Solo i PG possono unirsi a una campagna altrui tramite codice invito -
  // PNG/Mostri appartengono sempre e solo al GM proprietario.
  showInviteCode?: boolean;
  isPending?: boolean;
  error?: string | null;
  onSelectCampaign: (campaignId: string) => void;
  onConfirmInviteCode?: (code: string) => void;
  onClose: () => void;
}

export function CampaignAssignDialog({
  entityName,
  campaigns,
  showInviteCode = false,
  isPending = false,
  error,
  onSelectCampaign,
  onConfirmInviteCode,
  onClose,
}: CampaignAssignDialogProps) {
  const colors = getCurrentPaletteColors();
  const [inviteCodeDraft, setInviteCodeDraft] = useState('');

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ backgroundColor: colors.panel, border: `1px solid ${colors.border}` }}
        className="w-full max-w-sm rounded-2xl p-5 shadow-2xl"
      >
        <h3 className="mb-1 text-base font-semibold" style={{ color: colors.text }}>Assegna alla campagna</h3>
        <p className="mb-4 truncate text-sm" style={{ color: colors.text, opacity: 0.7 }}>{entityName}</p>

        {campaigns.length === 0 ? (
          <p className="mb-4 text-sm" style={{ color: colors.text, opacity: 0.7 }}>
            Nessuna campagna compatibile disponibile.
          </p>
        ) : (
          <div className="mb-2 max-h-64 space-y-1 overflow-y-auto">
            {campaigns.map(c => (
              <button
                key={c.id}
                type="button"
                disabled={isPending}
                onClick={() => onSelectCampaign(c.id)}
                style={{ border: `1px solid ${colors.border}`, color: colors.text }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-opacity hover:opacity-75 disabled:opacity-50"
              >
                <MapPin className="h-3.5 w-3.5 shrink-0" style={{ opacity: 0.7 }} />
                <span className="truncate">{c.name}</span>
                {c.suffix && <span className="shrink-0 text-xs" style={{ opacity: 0.6 }}>{c.suffix}</span>}
              </button>
            ))}
          </div>
        )}

        {isPending && <Loader2 className="mb-2 h-4 w-4 animate-spin" style={{ color: colors.text }} />}
        {error && <p className="mb-2 text-xs text-red-300">{error}</p>}

        {showInviteCode && (
          <>
            <div className="my-3 border-t" style={{ borderColor: colors.border }} />
            <p className="mb-1.5 text-xs uppercase tracking-[0.08em]" style={{ color: colors.text, opacity: 0.6 }}>
              Hai un codice invito?
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={inviteCodeDraft}
                onChange={e => setInviteCodeDraft(e.target.value.toUpperCase())}
                placeholder="Codice invito"
                disabled={isPending}
                style={{ borderColor: colors.border, color: colors.text, backgroundColor: 'transparent' }}
                className="w-full rounded-lg border px-2 py-1.5 text-xs uppercase tracking-[0.15em] disabled:opacity-50"
              />
              <button
                type="button"
                disabled={isPending || !inviteCodeDraft.trim()}
                onClick={() => onConfirmInviteCode?.(inviteCodeDraft.trim())}
                style={{ border: `1px solid ${colors.border}`, color: colors.text }}
                className="flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-xs transition-opacity hover:opacity-75 disabled:opacity-50"
              >
                <KeyRound className="h-3 w-3" /> Conferma
              </button>
            </div>
          </>
        )}

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
    </div>
  );
}
