import type { LucideIcon } from 'lucide-react';
import { Home, Users, Scroll, Skull } from 'lucide-react';
import type { Campaign } from '../campaigns/campaignTypes';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';

interface LeftSidebarProps {
  view: 'home' | 'dashboard';
  onGoHome: () => void;
  onGoToHomeSection: (section: 'characters' | 'campaigns') => void;
  onGoToCharacters: () => void;
  onGoToCampaigns: () => void;
  campaigns: Campaign[];
  activeCampaignId?: string | null;
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
      className={`flex w-full flex-col items-center gap-1 rounded-lg border-l-2 py-2 transition-colors ${
        active
          ? 'border-l-[var(--dash-accent)] bg-[var(--dash-accent)]/15 text-[var(--dash-text-strong)]'
          : 'border-l-transparent text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)]'
      }`}
    >
      <Icon className="h-5 w-5" />
      <span className="text-[10px] leading-tight text-center">{label}</span>
    </button>
  );
}

export function LeftSidebar({
  view,
  onGoHome,
  onGoToHomeSection,
  onGoToCharacters,
  onGoToCampaigns,
  campaigns,
  activeCampaignId,
  onSelectCampaign,
}: LeftSidebarProps) {
  return (
    <aside className="flex h-full w-[100px] shrink-0 flex-col items-center gap-1 border-r border-[var(--dash-border)] bg-[var(--dash-sidebar-bg)] py-3">
      <div className="mb-3 flex flex-col items-center gap-1">
        <img
          src="/hollowgate-logo.png"
          alt="Hollow Gate"
          className="h-20 w-20 rounded-xl border border-[var(--dash-border)] object-cover"
        />
      </div>

      <nav className="flex w-full flex-col items-center gap-1 px-2">
        <SidebarButton icon={Home} label="Panoramica" onClick={onGoHome} active={view === 'home'} />
        <SidebarButton icon={Users} label="Personaggi" onClick={onGoToCharacters} />
        <SidebarButton icon={Scroll} label="Campagne" onClick={onGoToCampaigns} />
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
                  className={`flex flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border transition-colors ${
                    campaign.logoUrl ? 'p-0' : 'px-1.5 py-2'
                  } ${
                    campaign.id === activeCampaignId
                      ? 'border-[var(--dash-accent)] bg-[var(--dash-surface-2)]'
                      : 'border-[var(--dash-border)] bg-[var(--dash-surface-2)]/60 hover:bg-[var(--dash-surface-2)]'
                  }`}
                  style={{ width: '100%', aspectRatio: campaign.logoUrl ? '1 / 1' : undefined }}
                >
                  {campaign.logoUrl ? (
                    <img src={campaign.logoUrl} alt={campaign.name} className="h-full w-full object-cover" />
                  ) : (
                    <>
                      <Skull className="h-4 w-4 text-[var(--dash-accent-2)]" />
                      <span className="w-full break-words text-center text-[10px] leading-tight text-[var(--dash-text)]">
                        {campaign.name}
                      </span>
                    </>
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
