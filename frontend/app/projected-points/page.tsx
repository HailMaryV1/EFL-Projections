import Link from "next/link";
import { createAuthServerClient } from "@/lib/supabaseServerClient";
import { type FixtureEntry } from "@/lib/fixtures";
import { fetchAllRows } from "@/lib/supabasePaginate";
import SiteHeader from "../SiteHeader";
import ProjectionsTable from "./ProjectionsTable";

const HORIZON_LABELS: Record<string, string> = { "1": "This gameweek", "2": "Next 2 gameweeks", "3": "Next 3 gameweeks", "5": "Next 5 gameweeks" };

export default async function ProjectedPointsPage({ searchParams }: { searchParams: Promise<{ horizon?: string }> }) {
  const params = await searchParams;
  const horizon = params.horizon && params.horizon !== "1" ? Number(params.horizon) : 1;
  const supabase = await createAuthServerClient();

  const { data: latestVersionRow } = await supabase.from("projections").select("algorithm_version_id").order("algorithm_version_id", { ascending: false }).limit(1).maybeSingle();
  const latestVersionId = latestVersionRow?.algorithm_version_id;

  const { data: gameweekRows } = latestVersionId
    ? await supabase.from("projections").select("gameweek").eq("horizon", horizon).eq("algorithm_version_id", latestVersionId)
    : { data: [] };
  const gameweek = Array.from(new Set((gameweekRows ?? []).map((r) => r.gameweek)))[0] ?? null;

  type TeamJoin = { name: string; competition: string; abbreviation: string; background_color: string; text_color: string } | null;
  type PlayerJoin = { full_name: string; position: string; ownership_pct: number | null; teams: TeamJoin };
  type ProjectionRow = { total_points: number; rating: number | null; per_layer: unknown; player_id: number; players: PlayerJoin };

  // Range-paginated - ~3570 real players is well past PostgREST's 1000-row
  // default cap (confirmed live: a single unbounded .select() here silently
  // truncated to "1000 of 1000 players"). See lib/supabasePaginate.ts.
  const rows =
    latestVersionId && gameweek !== null
      ? await fetchAllRows<ProjectionRow>((from, to) =>
          supabase
            .from("projections")
            .select(
              "total_points, rating, per_layer, player_id, players!inner(full_name, position, ownership_pct, teams!team_id(name, competition, abbreviation, background_color, text_color))"
            )
            .eq("horizon", horizon)
            .eq("gameweek", gameweek)
            .eq("algorithm_version_id", latestVersionId)
            .order("total_points", { ascending: false })
            .range(from, to) as unknown as PromiseLike<{ data: ProjectionRow[] | null; error: { message: string } | null }>
        )
      : [];

  const seasonRows = await fetchAllRows<{ player_id: number; total_points: number }>((from, to) =>
    supabase.from("player_stats").select("player_id, total_points").is("gameweek", null).range(from, to)
  );
  const seasonPointsByPlayer = new Map(seasonRows.map((r) => [r.player_id, Number(r.total_points) || 0]));

  const players = rows.map((r) => {
    const player = r.players as unknown as PlayerJoin;
    const perLayer = r.per_layer as unknown as { fixture_quantity?: { fixtures?: FixtureEntry[] } };
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
      totalPoints: Number(r.total_points),
      rating: r.rating === null ? null : Number(r.rating),
      fixtures: perLayer.fixture_quantity?.fixtures ?? [],
    };
  });

  return (
    <div className="flex flex-1 flex-col sm:flex-row">
      <SiteHeader />
      <main className="mx-auto w-full min-w-0 max-w-[1600px] flex-1 p-6">
        <h1 className="text-2xl font-semibold text-navy-100">Projected Points</h1>
        <p className="mt-1 text-sm text-navy-300">
          Every real, priced Fantasy EFL stat, per player, per gameweek - Championship, League One and League Two together.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          {gameweek !== null && (
            <span className="rounded-full bg-sky-500 px-4 py-1.5 font-[family-name:var(--font-cond)] text-sm font-bold uppercase tracking-wide text-navy-950">
              GW{gameweek}
            </span>
          )}
          <div className="flex flex-wrap gap-1 text-xs">
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
    </div>
  );
}
