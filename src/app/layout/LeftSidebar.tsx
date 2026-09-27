import { useRef, useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Home, Users, Scroll } from 'lucide-react';
import type { Campaign } from '../campaigns/campaignTypes';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';

interface LeftSidebarProps {
  view: 'home' | 'dashboard' | 'campaign-home';
  // Tab GM attivo nella vista dashboard - serve a evidenziare "Personaggi" /
  // "Campagne" con lo stesso criterio del TopBar (nessun tab GM attivo fuori
  // dalla dashboard, quindi nessuna icona accesa in home o in una campagna).
  activeSection?: string | null;
  onGoHome: () => void;
  onGoToHomeSection: (section: 'characters' | 'campaigns') => void;
  onGoToCharacters: () => void;
  onGoToCampaigns: () => void;
  campaigns: Campaign[];
  // Campagna selezionata ESPlicitamente in questa sessione (non
  // activeCampaignId, ripristinato da localStorage): solo su questa si
  // accende l'alone "selezionata", altrimenti brilla al caricamento
  // anche senza che l'utente abbia cliccato nulla.
  selectedCampaignId?: string | null;
  onSelectCampaign: (campaign: Campaign) => void;
}

function SidebarButton({
  icon: Icon,
  label,
  onClick,
  active,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`flex w-full flex-col items-center gap-1 rounded-lg py-2 transition-colors ${
        active
          ? 'bg-[var(--dash-accent)] text-[var(--dash-text-strong)]'
          : 'text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)]'
      }`}
    >
      <Icon className="h-5 w-5" />
      <span className="text-[10px] leading-tight text-center">{label}</span>
    </button>
  );
}

function MarqueeName({ name }: { name: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [duration, setDuration] = useState(6);

  useEffect(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (!container || !text) return;
    const overflow = text.scrollWidth - container.clientWidth;
    if (overflow > 2) {
      setIsOverflowing(true);
      // velocità costante indipendente dalla lunghezza: più lungo il nome,
      // più tempo impiega il loop, così la velocità percepita resta uniforme
      setDuration(Math.max(4, text.scrollWidth / 25));
    } else {
      setIsOverflowing(false);
    }
  }, [name]);

  if (!isOverflowing) {
    return (
      <div ref={containerRef} className="w-full overflow-hidden">
        <span
          ref={textRef}
          className="block px-1 py-0.5 text-center text-[9px] font-semibold leading-tight text-[var(--dash-text)]"
        >
          {name}
        </span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full overflow-hidden">
      <div
        className="marquee-loop flex w-max whitespace-nowrap py-0.5"
        style={{ animationDuration: `${duration}s` }}
      >
        <span ref={textRef} className="px-1 text-[9px] font-semibold leading-tight text-[var(--dash-text)]">
          {name}
        </span>
        <span className="px-1 text-[9px] font-semibold leading-tight text-[var(--dash-text)]" aria-hidden="true">
          {name}
        </span>
      </div>
    </div>
  );
}

export function LeftSidebar({
  view,
  activeSection = null,
  onGoHome,
  onGoToHomeSection,
  onGoToCharacters,
  onGoToCampaigns,
  campaigns,
  selectedCampaignId = null,
  onSelectCampaign,
}: LeftSidebarProps) {
  return (
    <aside className="relative z-[940] flex h-full w-[100px] shrink-0 flex-col items-center gap-1 border-r border-[var(--dash-border)] bg-[var(--dash-sidebar-bg)] py-3">
      <div className="mb-3 flex flex-col items-center gap-1">
        <img
          src="/hollowgate-logo.png"
          alt="Hollow Gate"
          className="h-20 w-20 rounded-xl border border-[var(--dash-border)] object-cover"
        />
      </div>

      <nav className="flex w-full flex-col items-center gap-1 px-2">
        <SidebarButton icon={Home} label="Panoramica" onClick={onGoHome} active={view === 'home'} />
        <SidebarButton icon={Users} label="Personaggi" onClick={onGoToCharacters} active={activeSection === 'characters'} />
        <SidebarButton icon={Scroll} label="Campagne" onClick={onGoToCampaigns} active={activeSection === 'campaigns'} />
      </nav>

      <div className="my-2 h-px w-10 bg-[var(--dash-border-soft)]" />

      <div className="flex w-full flex-col gap-1.5 px-2">
        {campaigns.length === 0 ? (
          <div className="py-2 text-center text-[10px] text-[var(--dash-muted)]">Nessuna campagna creata</div>
        ) : (
          campaigns.map(campaign => (
            <Tooltip key={campaign.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onSelectCampaign(campaign)}
                  className={`flex flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border transition-[background-color,border-color,box-shadow] ${
                    campaign.logoUrl ? 'p-0' : 'px-1.5 py-2'
                  } ${
                    campaign.id === selectedCampaignId
                      ? 'border-[var(--dash-accent)] bg-[var(--dash-surface-2)] shadow-[0_0_16px_var(--dash-accent)]/50'
                      : 'border-[var(--dash-border)] bg-[var(--dash-surface-2)]/60 hover:border-[var(--dash-accent)] hover:bg-[var(--dash-surface-2)] hover:shadow-[0_0_12px_var(--dash-accent)]/35'
                  }`}
                  style={{ width: '100%', aspectRatio: '1 / 1' }}
                >
                  {campaign.logoUrl ? (
                    <img src={campaign.logoUrl} alt={campaign.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full flex-col">
                      <div className="flex flex-1 items-center justify-center overflow-hidden p-0.5">
                        <img
                          src="/icon-source-1024.png"
                          alt=""
                          className="h-full w-full object-contain"
                          style={{ filter: 'invert(1)', opacity: 0.9 }}
                        />
                      </div>
                      <div
                        className="w-full shrink-0"
                        style={{ backgroundColor: 'var(--dash-panel)' }}
                      >
                        <MarqueeName name={campaign.name} />
                      </div>
                    </div>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{campaign.name}</TooltipContent>
            </Tooltip>
          ))
        )}
      </div>
    </aside>
  );
}
