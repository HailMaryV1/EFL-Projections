import Link from "next/link";
import { createAuthServerClient } from "@/lib/supabaseServerClient";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { buildBestSquad, buildBestClubPicks, type SquadCandidate, type ClubCandidate } from "@/lib/squadBuilder";
import TeamBadge from "../../TeamBadge";
import SquadTabs from "./SquadTabs";

// Real user request 2026-09-14: this page used to switch by HORIZON
// (this GW / next 2 / next 3 / next 5), which carries little decision
// value in Fantasy EFL - there's no budget and no squad carry-over, so
// you rebuild from scratch every week and never need to plan several
// weeks out. It now switches by GAMEWEEK instead, always at horizon=1,
// so each tab answers the question a manager actually has: "who is the
// best XI for THIS round". The engine writes the extra start gameweeks
// (see compute_player_projections.py's PLAYER_LOOKAHEAD_GAMEWEEKS).
const HORIZON = 1;

export default async function BestSquadPage({ searchParams }: { searchParams: Promise<{ gameweek?: string }> }) {
  const params = await searchParams;
  const supabase = await createAuthServerClient();

  const { data: latestVersionRow } = await supabase.from("projections").select("algorithm_version_id").order("algorithm_version_id", { ascending: false }).limit(1).maybeSingle();
  const latestVersionId = latestVersionRow?.algorithm_version_id;

  const { data: gameweekRows } = latestVersionId
    ? await supabase.from("projections").select("gameweek").eq("horizon", HORIZON).eq("algorithm_version_id", latestVersionId)
    : { data: [] };
  // SORTED, unlike the previous `[0]` off an unordered Set. That was safe
  // only while the engine wrote exactly one gameweek - with several, an
  // unsorted [0] is whichever row Postgres happened to return first, so
  // the page could silently open on a different week between loads.
  const gameweeks = Array.from(new Set((gameweekRows ?? []).map((r) => r.gameweek))).sort((a, b) => a - b);
  const currentGameweek = gameweeks[0] ?? null;
  const requested = params.gameweek ? Number(params.gameweek) : null;
  const gameweek = requested !== null && gameweeks.includes(requested) ? requested : currentGameweek;

  type PlayerJoin = { full_name: string; position: string; ownership_pct: number | null; teams: { id: number; name: string; abbreviation: string; background_color: string; text_color: string } | null };
  type ProjectionRow = { total_points: number; rating: number | null; player_id: number; players: PlayerJoin };
  const rows =
    latestVersionId && gameweek !== null
      ? await fetchAllRows<ProjectionRow>((from, to) =>
          supabase
            .from("projections")
            .select("total_points, rating, player_id, players!inner(full_name, position, ownership_pct, teams!team_id(id, name, abbreviation, background_color, text_color))")
            .eq("horizon", HORIZON)
            .eq("gameweek", gameweek)
            .eq("algorithm_version_id", latestVersionId)
            // Real bug found live while testing the page-load perf work: no
            // ORDER BY before a range()-paginated fetch leaves Postgres free
            // to return rows in a different order per page request, which
            // silently produced duplicate/missing player_ids across pages
            // (confirmed live via a "duplicate key" React warning on
            // Projected Points, which shares this same pagination helper).
            // A unique tiebreaker key makes every page's ordering stable.
            .order("player_id")
            .range(from, to) as unknown as PromiseLike<{ data: ProjectionRow[] | null; error: { message: string } | null }>
        )
      : [];

  const pool: SquadCandidate[] = rows
    .filter((r) => ["GK", "DEF", "MID", "FWD"].includes(r.players.position) && r.players.teams)
    .map((r) => ({
      playerId: r.player_id,
      name: r.players.full_name,
      position: r.players.position as SquadCandidate["position"],
      teamId: r.players.teams!.id,
      teamName: r.players.teams!.name,
      teamAbbreviation: r.players.teams!.abbreviation,
      teamBackgroundColor: r.players.teams!.background_color,
      teamTextColor: r.players.teams!.text_color,
      points: Number(r.total_points),
      rating: r.rating === null ? null : Number(r.rating),
      ownershipPct: r.players.ownership_pct === null ? null : Number(r.players.ownership_pct),
    }));

  const { byFormation, bestFormation } = buildBestSquad(pool);

  const { data: latestClubVersionRow } = await supabase.from("club_projections").select("algorithm_version_id").order("algorithm_version_id", { ascending: false }).limit(1).maybeSingle();
  const latestClubVersionId = latestClubVersionRow?.algorithm_version_id;
  const { data: clubRows } = latestClubVersionId && gameweek !== null
    ? await supabase
        .from("club_projections")
        .select("total_points, team_id, teams!inner(id, name, abbreviation, background_color, text_color)")
        .eq("horizon", HORIZON)
        .eq("gameweek", gameweek)
        .eq("algorithm_version_id", latestClubVersionId)
    : { data: [] };
  type TeamJoin = { id: number; name: string; abbreviation: string; background_color: string; text_color: string };
  type ClubRow = { total_points: number; team_id: number; teams: TeamJoin };
  const clubPool: (ClubCandidate & { team: TeamJoin })[] = ((clubRows ?? []) as unknown as ClubRow[]).map((r) => ({
    teamId: r.team_id,
    teamName: r.teams.name,
    points: Number(r.total_points),
    team: r.teams,
  }));
  const bestClubs = buildBestClubPicks(clubPool);
  const combinedTotal = byFormation[bestFormation].totalPoints + bestClubs.reduce((sum, c) => sum + c.points, 0);

  return (
    <main className="mx-auto w-full min-w-0 max-w-5xl flex-1 p-6">
        <h1 className="text-2xl font-semibold text-navy-100">HM Best Squad</h1>
        <p className="mt-1 max-w-2xl text-sm text-navy-300">
          The strongest real 7 players Fantasy EFL&rsquo;s own rules allow (any of the 3 real formations, max 2 per club) plus
          your best 2 real club picks - no budget, no player prices, just the real numbers. Every tab is that gameweek on its
          own, not a running total - you rebuild your whole team each round anyway.
        </p>

        <div className="mt-4 flex flex-wrap gap-1.5 text-xs">
          {gameweeks.map((gw) => (
            <Link
              key={gw}
              href={`/best-squad?gameweek=${gw}`}
              className={`rounded-full px-4 py-1.5 font-[family-name:var(--font-cond)] text-sm font-bold uppercase tracking-wide ${
                gw === gameweek ? "bg-sky-500 text-navy-950" : "bg-navy-900 text-navy-400 hover:bg-navy-800"
              }`}
            >
              GW{gw}
              {gw === currentGameweek && <span className="ml-1.5 font-sans text-[10px] font-medium normal-case opacity-70">this week</span>}
            </Link>
          ))}
        </div>

        {pool.length === 0 ? (
          <p className="mt-8 text-sm text-navy-400">No projections for this selection yet.</p>
        ) : (
          <>
            <div className="mt-6 rounded-lg border border-sky-900/60 bg-sky-950/20 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-300">Full squad projected total</p>
              <p className="mt-1 font-[family-name:var(--font-cond)] text-3xl font-extrabold text-navy-100">{combinedTotal.toFixed(1)} pts</p>
              <p className="mt-1 text-xs text-navy-400">Best formation&rsquo;s 7 players + your best 2 club picks, combined.</p>
            </div>

            <section className="mt-8">
              <h2 className="font-[family-name:var(--font-cond)] text-lg font-extrabold uppercase tracking-wide text-navy-200">Your 7 players</h2>
              <div className="mt-3">
                <SquadTabs byFormation={byFormation} bestFormation={bestFormation} />
              </div>
            </section>

            <section className="mt-8">
              <h2 className="font-[family-name:var(--font-cond)] text-lg font-extrabold uppercase tracking-wide text-navy-200">Your 2 club picks</h2>
              <p className="mt-1 text-xs text-navy-400">
                Remember the real rule: you can only select an individual club a maximum of 5 times over the whole season - this
                tool only ranks the selected gameweek&rsquo;s real projection, it doesn&rsquo;t track your own season history.
              </p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {bestClubs.map((c, i) => {
                  const full = clubPool.find((x) => x.teamId === c.teamId)!;
                  return (
                    <div key={c.teamId} className="flex items-center gap-3 rounded-xl border border-navy-800 bg-navy-900 p-4">
                      <span className="font-[family-name:var(--font-cond)] text-sm font-bold text-navy-500">{i + 1}</span>
                      <TeamBadge team={{ abbreviation: full.team.abbreviation, backgroundColor: full.team.background_color, textColor: full.team.text_color }} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-[family-name:var(--font-cond)] text-base font-bold uppercase text-navy-100">{c.teamName}</p>
                      </div>
                      <span className="font-[family-name:var(--font-cond)] text-2xl font-extrabold text-sky-300">{c.points.toFixed(1)}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}
    </main>
  );
}
