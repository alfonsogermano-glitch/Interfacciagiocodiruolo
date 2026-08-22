export function LazyFeatureFallback() {
  return (
    <div
      data-testid="lazy-feature-fallback"
      className="flex min-h-[12rem] w-full items-center justify-center bg-[var(--dash-bg)]"
    >
      <div className="flex flex-col items-center gap-3">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--dash-accent)] border-t-transparent" />
        <p className="text-sm text-[var(--dash-muted)]">Caricamento...</p>
      </div>
    </div>
  );
}
