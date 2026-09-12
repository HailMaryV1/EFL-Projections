import Link from "next/link";
import { createAuthServerClient } from "@/lib/supabaseServerClient";

type FeatureCard = { href: string; title: string; description: string };
const FEATURES: FeatureCard[] = [
  { href: "/projected-points", title: "Projected Points", description: "Every real, priced Fantasy EFL stat for every player across all 3 divisions, any gameweek or horizon." },
  { href: "/fixtures", title: "Fixture Forecast", description: "Real win/draw/loss odds, projected goals, and clean sheet chances for every Championship, League One and League Two fixture." },
  { href: "/best-squad", title: "HM Best Squad", description: "The strongest real 7 players (any formation) plus your best 2 club picks - no budget, just the real numbers." },
  { href: "/top-picks", title: "HM Top Picks", description: "Build a shareable Top 5 leaderboard for any position or division, downloadable as an image." },
  { href: "/compare", title: "Player Face-Off", description: "Put two players head-to-head - projections, form, fixtures, ownership, side by side." },
];

export default async function HomePage() {
  const supabase = await createAuthServerClient();

  const [{ count: activePlayers }, { count: teamCount }, { data: latestVersionRow }] = await Promise.all([
    supabase.from("players").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("teams").select("*", { count: "exact", head: true }),
    supabase.from("projections").select("algorithm_version_id").order("algorithm_version_id", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const latestVersionId = latestVersionRow?.algorithm_version_id;

  // Scoped to the CURRENT algorithm version only - projections accumulates
  // a full new set of rows on every real engine run (each one genuinely
  // attributable to the weights that produced it, see algorithm_versions),
  // so an unscoped count would include stale historical runs too, reading
  // as a far bigger real number than what the site is actually showing
  // right now.
  const { count: projectionCount } = latestVersionId
    ? await supabase.from("projections").select("*", { count: "exact", head: true }).eq("algorithm_version_id", latestVersionId)
    : { count: 0 };

  const { data: gameweekRows } = latestVersionId
    ? await supabase.from("projections").select("gameweek").eq("horizon", 1).eq("algorithm_version_id", latestVersionId)
    : { data: [] };
  const gameweeks = Array.from(new Set((gameweekRows ?? []).map((r) => r.gameweek)));
  const currentGameweek = gameweeks[0] ?? null;

  const { data: topRows } = latestVersionId && currentGameweek !== null
    ? await supabase
        .from("projections")
        .select("total_points, player_id, players!inner(full_name, position, teams!team_id(name, abbreviation, background_color, text_color))")
        .eq("horizon", 1)
        .eq("gameweek", currentGameweek)
        .eq("algorithm_version_id", latestVersionId)
        .order("total_points", { ascending: false })
        .limit(5)
    : { data: [] };
  type PlayerJoin = { full_name: string; position: string; teams: { name: string; abbreviation: string; background_color: string; text_color: string } | null };
  type TopRow = { total_points: number; player_id: number; players: PlayerJoin };
  const topPlayers = ((topRows ?? []) as unknown as TopRow[]).map((r) => ({
    playerId: r.player_id,
    name: r.players.full_name,
    position: r.players.position,
    team: r.players.teams,
    points: Number(r.total_points),
  }));

  return (
    <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 p-6 sm:p-10">
        <p className="text-xs font-bold uppercase tracking-wide text-sky-400">Hail Mary Fantasy Sports</p>
        <h1 className="mt-2 font-[family-name:var(--font-cond)] text-4xl font-extrabold text-navy-100 sm:text-5xl">EFL Projections</h1>
        <p className="mt-4 max-w-2xl text-base text-navy-300">
          Real projected points for every Fantasy EFL player across the Championship, League One and League Two - no budget, no
          player prices, just real per-fixture expected points, priced through the official real scoring rules. Plus a projection
          engine for the 2 club picks the game also scores.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/projected-points" className="rounded-md bg-sky-500 px-5 py-2.5 font-[family-name:var(--font-cond)] text-sm font-bold tracking-wide text-navy-950 uppercase hover:bg-sky-300">
            See Projected Points
          </Link>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Players tracked" value={activePlayers !== null ? String(activePlayers) : "—"} />
          <Stat label="Clubs tracked" value={teamCount !== null ? String(teamCount) : "—"} hint="Championship, League One, League Two" />
          <Stat label="Projections" value={projectionCount !== null ? projectionCount.toLocaleString() : "—"} />
        </div>

        {topPlayers.length > 0 && (
          <div className="mt-10">
            <h2 className="font-[family-name:var(--font-cond)] text-xl font-extrabold uppercase tracking-wide text-navy-200">
              Top 5 projected {currentGameweek !== null ? `for GW${currentGameweek}` : "right now"}
            </h2>
            <div className="mt-3 flex flex-col gap-2">
              {topPlayers.map((p, i) => (
                <Link
                  key={p.playerId}
                  href={`/players/${p.playerId}`}
                  className="flex items-center gap-3 rounded-lg border border-navy-800 bg-navy-900 px-4 py-2.5 hover:border-navy-600"
                >
                  <span className="w-5 shrink-0 text-center font-[family-name:var(--font-cond)] text-sm font-bold text-navy-500">{i + 1}</span>
                  <span
                    className="flex h-8 w-11 shrink-0 items-center justify-center rounded-md font-[family-name:var(--font-cond)] text-[11px] font-bold"
                    style={{ background: p.team?.background_color || "#46617f", color: p.team?.text_color || "#f8fafc" }}
                  >
                    {p.team?.abbreviation ?? "?"}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-[family-name:var(--font-cond)] text-base font-bold text-navy-100 uppercase">{p.name}</span>
                  <span className="shrink-0 text-xs text-navy-500">{p.position} · {p.team?.name ?? "—"}</span>
                  <span className="shrink-0 font-mono text-lg font-extrabold text-sky-300">{p.points.toFixed(1)}</span>
                </Link>
              ))}
            </div>
            <Link href="/projected-points" className="mt-3 inline-block text-xs font-semibold text-sky-400 hover:underline">
              See all {activePlayers ?? ""} players →
            </Link>
          </div>
        )}

        <div className="mt-12 mb-6">
          <h2 className="font-[family-name:var(--font-cond)] text-xl font-extrabold uppercase tracking-wide text-navy-200">What you&apos;ll find here</h2>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <Link key={f.href} href={f.href} className="rounded-xl border border-navy-800 bg-navy-900 p-4 hover:border-navy-600">
                <p className="font-[family-name:var(--font-cond)] text-base font-bold text-navy-100 uppercase">{f.title}</p>
                <p className="mt-1.5 text-sm text-navy-400">{f.description}</p>
              </Link>
            ))}
          </div>
        </div>
    </main>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-navy-800 bg-navy-900 p-5">
      <p className="font-[family-name:var(--font-cond)] text-3xl font-extrabold text-navy-100">{value}</p>
      <p className="mt-1 text-sm text-navy-300">{label}</p>
      {hint && <p className="mt-0.5 text-xs text-navy-500">{hint}</p>}
    </div>
  );
}
