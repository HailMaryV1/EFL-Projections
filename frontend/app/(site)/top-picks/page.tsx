import Link from "next/link";
import { createAuthServerClient } from "@/lib/supabaseServerClient";
import { fetchAllRows } from "@/lib/supabasePaginate";
import Top5Builder from "./Top5Builder";

const HORIZON_LABELS: Record<string, string> = { "1": "This gameweek", "2": "Next 2 gameweeks", "3": "Next 3 gameweeks", "5": "Next 5 gameweeks" };
const COMPETITION_LABELS: Record<string, string> = { championship: "Championship", league_one: "League One", league_two: "League Two" };

export default async function TopPicksPage({ searchParams }: { searchParams: Promise<{ horizon?: string }> }) {
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
  type PlayerJoin = { full_name: string; position: string; teams: TeamJoin };
  type ProjectionRow = { total_points: number; player_id: number; players: PlayerJoin };
  const rows =
    latestVersionId && gameweek !== null
      ? await fetchAllRows<ProjectionRow>((from, to) =>
          supabase
            .from("projections")
            .select("total_points, player_id, players!inner(full_name, position, teams!team_id(name, competition, abbreviation, background_color, text_color))")
            .eq("horizon", horizon)
            .eq("gameweek", gameweek)
            .eq("algorithm_version_id", latestVersionId)
            // Real bug (see best-squad/page.tsx's identical fix): no ORDER
            // BY before a range()-paginated fetch leaves row order unstable
            // across pages, causing real duplicate/missing player_ids.
            .order("player_id")
            .range(from, to) as unknown as PromiseLike<{ data: ProjectionRow[] | null; error: { message: string } | null }>
        )
      : [];

  const players = rows
    .filter((r) => ["GK", "DEF", "MID", "FWD"].includes(r.players.position) && r.players.teams)
    .map((r) => ({
      playerId: r.player_id,
      name: r.players.full_name,
      position: r.players.position,
      team: {
        name: r.players.teams!.name,
        abbreviation: r.players.teams!.abbreviation,
        backgroundColor: r.players.teams!.background_color,
        textColor: r.players.teams!.text_color,
      },
      competition: r.players.teams!.competition,
      competitionLabel: COMPETITION_LABELS[r.players.teams!.competition] ?? r.players.teams!.competition,
      totalPoints: Number(r.total_points),
    }));

  return (
    <main className="mx-auto w-full min-w-0 max-w-5xl flex-1 p-6">
        <h1 className="text-2xl font-semibold text-navy-100">HM Top Picks</h1>
        <p className="mt-1 max-w-2xl text-sm text-navy-300">
          Build a real, shareable Top 5 leaderboard - any position, any division - and download it as an image for Twitter/X.
        </p>

        <div className="mt-4 flex flex-wrap gap-1 text-xs">
          {Object.entries(HORIZON_LABELS).map(([value, label]) => (
            <Link
              key={value}
              href={`/top-picks?horizon=${value}`}
              className={`rounded-md px-2 py-1 ${Number(value) === horizon ? "bg-navy-800 font-medium text-navy-100" : "text-navy-400 hover:text-navy-100"}`}
            >
              {label}
            </Link>
          ))}
        </div>

        {players.length === 0 || gameweek === null ? (
          <p className="mt-8 text-sm text-navy-400">No projections for this selection yet.</p>
        ) : (
          <div className="mt-6">
            <Top5Builder players={players} gameweek={gameweek} horizon={horizon} />
          </div>
        )}
    </main>
  );
}
