import SiteHeader from "../SiteHeader";

// Real perf fix (ported from dreamteam-projections): SiteHeader does a
// real supabase.auth.getUser() check - rendering it per-page meant every
// one of the ~8 public tool pages re-ran that check on its own. Hoisted
// into this shared route-group layout instead, so it renders once and
// survives client-side navigation between pages.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col sm:flex-row">
      <SiteHeader />
      {children}
    </div>
  );
}
