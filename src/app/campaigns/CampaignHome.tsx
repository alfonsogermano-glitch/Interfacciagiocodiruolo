import { useCampaign } from './CampaignContext';

interface CampaignHomeProps {
  onGoToManagement: () => void;
}

export function CampaignHome({ onGoToManagement }: CampaignHomeProps) {
  const { activeCampaign } = useCampaign();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold text-[var(--dash-text-strong)]">
        {activeCampaign?.name ?? 'Campagna'}
      </h1>
      <p className="text-sm text-[var(--dash-muted)]">
        Schermata iniziale della campagna — in costruzione.
      </p>
      <button
        type="button"
        onClick={onGoToManagement}
        className="rounded-xl border border-[var(--dash-accent)] px-4 py-2 text-sm font-semibold text-[var(--dash-accent)] hover:bg-[var(--dash-surface-2)]"
      >
        Vai alla gestione
      </button>
    </div>
  );
}
