// Real placeholder - Phase 5 (public frontend: Projected Points, Fixture
// Forecast, XI Builder, Club Picks, Top Picks, Compare) hasn't been built
// yet (see CLAUDE.md Status). Honest "not live yet" state rather than a
// fake/empty version of pages that don't exist, same principle as this
// project's own "never fabricate a number" rule applied to the UI layer.
export default function HomePage() {
  return (
    <main className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-xs font-bold uppercase tracking-wide text-sky-400">Hail Mary Fantasy Sports</p>
      <h1 className="font-[family-name:var(--font-cond)] text-4xl font-extrabold text-navy-100 sm:text-5xl">EFL Projections</h1>
      <p className="max-w-md text-sm text-navy-300">
        Real player and club projections for Fantasy EFL - Championship, League One and League Two. The public site is still
        being built. Check back soon.
      </p>
    </main>
  );
}
