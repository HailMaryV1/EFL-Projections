import Link from "next/link";
import { createAuthServerClient } from "@/lib/supabaseServerClient";
import { type FixtureEntry } from "@/lib/fixtures";
import { fetchAllRows } from "@/lib/supabasePaginate";
import ProjectionsTable from "./ProjectionsTable";

// Widest real window compute_player_projections.py computes (see its own
// HORIZONS constant). Its per_stat.fixtures/per_layer.fixture_quantity.
// fixtures arrays are real supersets covering every real gameweek from the
// current one out to 4 weeks ahead - querying this one horizon covers
// every single gameweek this page can navigate to, real fixture-level
// entries, never summed (mirrors compute_club_projections.py's own
// per_stat.fixtures, which the Fixture Forecast page already reads the
// same way).
const MAX_HORIZON = 5;
const HORIZON_LABELS: Record<string, string> = { "2": "Next 2 gameweeks", "3": "Next 3 gameweeks", "5": "Next 5 gameweeks" };

type FixtureStatsEntry = { gameweek: number; opponent_team_id: number; is_home: boolean; total_points: number };

export default async function ProjectedPointsPage({ searchParams }: { searchParams: Promise<{ horizon?: string; gameweek?: string }> }) {
  const params = await searchParams;
  const horizon = params.horizon ? Number(params.horizon) : null; // null = single real gameweek mode (the default)
  const supabase = await createAuthServerClient();

  const { data: latestVersionRow } = await supabase.from("projections").select("algorithm_version_id").order("algorithm_version_id", { ascending: false }).limit(1).maybeSingle();
  const latestVersionId = latestVersionRow?.algorithm_version_id;

  // Real perf fix (ported from dreamteam-projections): currentGwRow needs
  // latestVersionId, but the season-aggregate seasonRows fetch below never
  // depended on either of these - it was awaited one after another anyway.
  // Any horizon's `gameweek` column gives the real current gameweek (it's
  // horizon-independent - see compute_player_projections.py's main()).
  const [{ data: currentGwRow }, seasonRows] = await Promise.all([
    latestVersionId
      ? supabase.from("projections").select("gameweek").eq("horizon", 1).eq("algorithm_version_id", latestVersionId).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
    fetchAllRows<{ player_id: number; total_points: number }>((from, to) =>
      supabase.from("player_stats").select("player_id, total_points").is("gameweek", null).range(from, to)
    ),
  ]);
  const currentGameweek: number | null = currentGwRow?.gameweek ?? null;
  const requestedGameweek = params.gameweek ? Number(params.gameweek) : currentGameweek;
  // Real gameweek arrows only ever navigate within the real MAX_HORIZON
  // window (the only span this engine actually projects) - clamped rather
  // than silently showing an out-of-range week's stale/empty data.
  const selectedGameweek =
    currentGameweek !== null && requestedGameweek !== null
      ? Math.min(Math.max(requestedGameweek, currentGameweek), currentGameweek + MAX_HORIZON - 1)
      : requestedGameweek;

  type TeamJoin = { name: string; competition: string; abbreviation: string; background_color: string; text_color: string } | null;
  type PlayerJoin = { full_name: string; position: string; ownership_pct: number | null; teams: TeamJoin };
  type ProjectionRow = { total_points: number; rating: number | null; per_stat: unknown; per_layer: unknown; player_id: number; players: PlayerJoin };

  // Real bug fix 2026-09-13: this used to query whichever horizon the
  // selected tab implied (horizon=1 for "this gameweek"), whose own
  // per_stat.fixtures/fixture_quantity.fixtures arrays only ever contain
  // the CURRENT gameweek - selecting any other real gameweek found
  // nothing. Single-gameweek mode now always queries the widest real
  // horizon (a real superset) and filters its per-fixture arrays down to
  // the one selected gameweek instead.
  const queryHorizon = horizon ?? MAX_HORIZON;

  // Range-paginated - ~3570 real players is well past PostgREST's 1000-row
  // default cap (confirmed live: a single unbounded .select() here silently
  // truncated to "1000 of 1000 players"). See lib/supabasePaginate.ts.
  const rows =
    latestVersionId && currentGameweek !== null
      ? await fetchAllRows<ProjectionRow>((from, to) =>
          supabase
            .from("projections")
            .select(
              "total_points, rating, per_stat, per_layer, player_id, players!inner(full_name, position, ownership_pct, teams!team_id(name, competition, abbreviation, background_color, text_color))"
            )
            .eq("horizon", queryHorizon)
            .eq("gameweek", currentGameweek)
            .eq("algorithm_version_id", latestVersionId)
            // Real bug found live while testing the page-load perf work:
            // ordering by total_points alone before a range()-paginated
            // fetch is unstable across pages once ties exist (many players
            // share the same total_points, especially 0) - Postgres is free
            // to return them in a different relative order per page
            // request, silently producing duplicate/missing player_ids
            // across the full ~3570-player fetch (confirmed live via a
            // "duplicate key" React warning on this exact page). A unique
            // tiebreaker key makes every page's ordering stable.
            .order("total_points", { ascending: false })
            .order("player_id")
            .range(from, to) as unknown as PromiseLike<{ data: ProjectionRow[] | null; error: { message: string } | null }>
        )
      : [];

  const seasonPointsByPlayer = new Map(seasonRows.map((r) => [r.player_id, Number(r.total_points) || 0]));

  const players = rows
    .map((r) => {
      const player = r.players as unknown as PlayerJoin;
      const perLayer = r.per_layer as unknown as { fixture_quantity?: { fixtures?: FixtureEntry[] } };
      const allFixtures = perLayer.fixture_quantity?.fixtures ?? [];

      let totalPoints: number;
      let fixtures: FixtureEntry[];
      if (horizon) {
        // Cumulative mode - unchanged real behaviour, the whole window's summed total.
        totalPoints = Number(r.total_points);
        fixtures = allFixtures;
      } else {
        // Single real gameweek mode - sums every real fixture that specific
        // week (Fantasy EFL's own real double-gameweek rule - see
        // project_stats' own docstring), not the whole horizon.
        const perStat = r.per_stat as { fixtures?: FixtureStatsEntry[] };
        const weekEntries = (perStat.fixtures ?? []).filter((f) => f.gameweek === selectedGameweek);
        totalPoints = weekEntries.reduce((sum, f) => sum + f.total_points, 0);
        fixtures = allFixtures.filter((f) => f.gameweek === selectedGameweek);
      }

      return {
        playerId: r.player_id,
        name: player.full_name,
        position: player.position,
        team: {
          name: player.teams?.name ?? "—",
          abbreviation: player.teams?.abbreviation ?? null,
          backgroundColor: player.teams?.background_color ?? null,
          textColor: player.teams?.text_color ?? null,
        },
        competition: player.teams?.competition ?? "—",
        ownershipPct: player.ownership_pct === null ? null : Number(player.ownership_pct),
        seasonPoints: seasonPointsByPlayer.get(r.player_id) ?? 0,
        totalPoints,
        rating: r.rating === null ? null : Number(r.rating),
        fixtures,
      };
    })
    // Single-gameweek mode: a team with no real fixture that week (a real
    // blank gameweek) is dropped, not shown as a false "0 projected" -
    // same "genuine blank, not a guess" convention used everywhere else.
    .filter((p) => horizon !== null || p.fixtures.length > 0)
    .sort((a, b) => b.totalPoints - a.totalPoints);

  return (
    <main className="mx-auto w-full min-w-0 max-w-[1600px] flex-1 p-6">
        <h1 className="text-2xl font-semibold text-navy-100">Projected Points</h1>
        <p className="mt-1 text-sm text-navy-300">
          Every real, priced Fantasy EFL stat, per player, per gameweek - Championship, League One and League Two together.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          {horizon === null && selectedGameweek !== null ? (
            <div className="flex items-center gap-2">
              <Link
                href={`/projected-points?gameweek=${selectedGameweek - 1}`}
                aria-disabled={currentGameweek === null || selectedGameweek <= currentGameweek}
                className={`px-1 text-navy-400 hover:text-navy-100 ${
                  currentGameweek === null || selectedGameweek <= currentGameweek ? "pointer-events-none opacity-30" : ""
                }`}
              >
                ‹
              </Link>
              <span className="rounded-full bg-sky-500 px-4 py-1.5 font-[family-name:var(--font-cond)] text-sm font-bold uppercase tracking-wide text-navy-950">
                GW{selectedGameweek}
              </span>
              <Link
                href={`/projected-points?gameweek=${selectedGameweek + 1}`}
                aria-disabled={currentGameweek === null || selectedGameweek >= currentGameweek + MAX_HORIZON - 1}
                className={`px-1 text-navy-400 hover:text-navy-100 ${
                  currentGameweek === null || selectedGameweek >= currentGameweek + MAX_HORIZON - 1 ? "pointer-events-none opacity-30" : ""
                }`}
              >
                ›
              </Link>
            </div>
          ) : (
            currentGameweek !== null && (
              <span className="rounded-full bg-navy-800 px-4 py-1.5 font-[family-name:var(--font-cond)] text-sm font-bold uppercase tracking-wide text-navy-200">
                GW{currentGameweek}-{currentGameweek + (horizon ?? 1) - 1}
              </span>
            )
          )}
          <div className="flex flex-wrap gap-1 text-xs">
            <Link
              href="/projected-points"
              className={`rounded-md px-2 py-1 ${horizon === null ? "bg-navy-800 font-medium text-navy-100" : "text-navy-400 hover:text-navy-100"}`}
            >
              This gameweek
            </Link>
            {Object.entries(HORIZON_LABELS).map(([value, label]) => (
              <Link
                key={value}
                href={`/projected-points?horizon=${value}`}
                className={`rounded-md px-2 py-1 ${
                  Number(value) === horizon ? "bg-navy-800 font-medium text-navy-100" : "text-navy-400 hover:text-navy-100"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>

        {players.length === 0 ? (
          <p className="mt-8 text-sm text-navy-400">No projections for this selection yet.</p>
        ) : (
          <div className="mt-6">
            <ProjectionsTable players={players} />
          </div>
        )}
    </main>
  );
}
