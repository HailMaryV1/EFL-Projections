import Link from "next/link";
import { createAuthServerClient } from "@/lib/supabaseServerClient";
import { fetchAllRows } from "@/lib/supabasePaginate";
import SiteHeader from "../SiteHeader";
import FixtureCard, { type FixtureSide, type ProjectedPlayer } from "./FixtureCard";

const COMPETITIONS = [
  { value: "championship", label: "Championship" },
  { value: "league_one", label: "League One" },
  { value: "league_two", label: "League Two" },
] as const;

type ClubFixtureEntry = {
  gameweek: number;
  opponent_team_id: number;
  is_home: boolean;
  win_prob: number;
  draw_prob: number;
  clean_sheet_prob: number;
  two_plus_goals_prob: number;
  expected_goals_for: number;
};

export default async function FixturesPage({ searchParams }: { searchParams: Promise<{ competition?: string; gameweek?: string }> }) {
  const params = await searchParams;
  const competition = COMPETITIONS.some((c) => c.value === params.competition) ? params.competition! : "championship";
  const supabase = await createAuthServerClient();

  const { data: gwRows } = await supabase.from("fixtures").select("gameweek").eq("competition", competition);
  const gameweeks = Array.from(new Set((gwRows ?? []).map((r) => r.gameweek))).sort((a, b) => a - b);

  const now = new Date();
  const { data: currentGwRow } = await supabase
    .from("fixtures")
    .select("gameweek")
    .eq("competition", competition)
    .gte("kickoff_at", now.toISOString())
    .order("gameweek", { ascending: true })
    .limit(1)
    .maybeSingle();
  const currentGameweek = currentGwRow?.gameweek ?? gameweeks[gameweeks.length - 1] ?? gameweeks[0];
  const selectedGameweek = params.gameweek ? Number(params.gameweek) : currentGameweek;

  const { data: fixtureRows, error: fixturesError } = await supabase
    .from("fixtures")
    .select("id, kickoff_at, home_team_id, away_team_id, teams_home:home_team_id(id, name, abbreviation, background_color, text_color), teams_away:away_team_id(id, name, abbreviation, background_color, text_color)")
    .eq("competition", competition)
    .eq("gameweek", selectedGameweek)
    .order("kickoff_at");
  if (fixturesError) throw new Error(`Failed to load fixtures: ${fixturesError.message}`);

  const teamIds = Array.from(new Set((fixtureRows ?? []).flatMap((f) => [f.home_team_id, f.away_team_id])));

  const { data: latestClubVersionRow } = await supabase.from("club_projections").select("algorithm_version_id").order("algorithm_version_id", { ascending: false }).limit(1).maybeSingle();
  const latestClubVersionId = latestClubVersionRow?.algorithm_version_id;

  const { data: clubProjRows } = latestClubVersionId && teamIds.length
    ? await supabase.from("club_projections").select("team_id, per_stat").eq("horizon", 1).eq("algorithm_version_id", latestClubVersionId).in("team_id", teamIds)
    : { data: [] };
  const clubFixturesByTeam = new Map<number, ClubFixtureEntry[]>();
  for (const row of clubProjRows ?? []) {
    const perStat = row.per_stat as { fixtures?: ClubFixtureEntry[] };
    clubFixturesByTeam.set(row.team_id, perStat.fixtures ?? []);
  }

  const { data: latestPlayerVersionRow } = await supabase.from("projections").select("algorithm_version_id").order("algorithm_version_id", { ascending: false }).limit(1).maybeSingle();
  const latestPlayerVersionId = latestPlayerVersionRow?.algorithm_version_id;
  type PlayerJoin = { full_name: string; team_id: number };
  type ProjRow = { total_points: number; player_id: number; players: PlayerJoin };
  // Range-paginated - unfiltered by division, so this spans up to the full
  // ~3570-player pool for the current gameweek (well past PostgREST's
  // 1000-row cap - same real bug already found on Projected Points).
  const projRows =
    latestPlayerVersionId && teamIds.length
      ? await fetchAllRows<ProjRow>((from, to) =>
          supabase
            .from("projections")
            .select("total_points, player_id, players!inner(full_name, team_id)")
            .eq("horizon", 1)
            .eq("gameweek", selectedGameweek)
            .eq("algorithm_version_id", latestPlayerVersionId)
            .order("total_points", { ascending: false })
            .range(from, to) as unknown as PromiseLike<{ data: ProjRow[] | null; error: { message: string } | null }>
        )
      : [];
  const projectedByTeam = new Map<number, ProjectedPlayer[]>();
  for (const r of projRows) {
    const player = r.players as unknown as PlayerJoin;
    const list = projectedByTeam.get(player.team_id) ?? [];
    if (list.length < 3) {
      list.push({ playerId: r.player_id, name: player.full_name, totalPoints: Number(r.total_points) });
      projectedByTeam.set(player.team_id, list);
    }
  }

  type TeamRow = { id: number; name: string; abbreviation: string; background_color: string; text_color: string };
  function buildSide(team: TeamRow, opponentId: number, isHome: boolean): FixtureSide {
    const entries = clubFixturesByTeam.get(team.id) ?? [];
    const match = entries.find((e) => e.gameweek === selectedGameweek && e.opponent_team_id === opponentId && e.is_home === isHome);
    return {
      team: { id: team.id, name: team.name, abbreviation: team.abbreviation, backgroundColor: team.background_color, textColor: team.text_color },
      winProb: match?.win_prob ?? null,
      cleanSheetProb: match?.clean_sheet_prob ?? null,
      twoPlusGoalsProb: match?.two_plus_goals_prob ?? null,
      expectedGoals: match?.expected_goals_for ?? null,
    };
  }

  return (
    <div className="flex flex-1 flex-col sm:flex-row">
      <SiteHeader />
      <main className="mx-auto w-full min-w-0 max-w-5xl flex-1 p-6">
        <h1 className="text-2xl font-semibold text-navy-100">Fixture Forecast</h1>
        <p className="mt-1 text-sm text-navy-300">
          Real win/draw/loss odds, projected goals, and clean sheet chances - built from each club&rsquo;s own real season attack/
          defense record and the official FDR rating, the same real signals behind every player projection on this site.
        </p>

        <div className="mt-4 flex flex-wrap gap-1">
          {COMPETITIONS.map((c) => (
            <Link
              key={c.value}
              href={`/fixtures?competition=${c.value}`}
              className={`rounded-full px-4 py-1.5 font-[family-name:var(--font-cond)] text-sm font-bold uppercase tracking-wide ${
                c.value === competition ? "bg-sky-500 text-navy-950" : "bg-navy-900 text-navy-400 hover:bg-navy-800"
              }`}
            >
              {c.label}
            </Link>
          ))}
        </div>

        {(() => {
          const idx = gameweeks.indexOf(selectedGameweek);
          const prevGw = idx > 0 ? gameweeks[idx - 1] : null;
          const nextGw = idx >= 0 && idx < gameweeks.length - 1 ? gameweeks[idx + 1] : null;
          return (
            <div className="mt-4 flex items-center gap-3">
              {prevGw !== null ? (
                <Link href={`/fixtures?competition=${competition}&gameweek=${prevGw}`} className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-900 text-navy-300 hover:bg-navy-800 hover:text-sky-300">
                  ‹
                </Link>
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full text-navy-700">‹</span>
              )}
              <span className="rounded-full bg-sky-500 px-5 py-1.5 font-[family-name:var(--font-cond)] text-sm font-bold uppercase tracking-wide text-navy-950">
                Gameweek {selectedGameweek}
              </span>
              {nextGw !== null ? (
                <Link href={`/fixtures?competition=${competition}&gameweek=${nextGw}`} className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-900 text-navy-300 hover:bg-navy-800 hover:text-sky-300">
                  ›
                </Link>
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full text-navy-700">›</span>
              )}
            </div>
          );
        })()}

        {(fixtureRows ?? []).length === 0 ? (
          <p className="mt-8 text-sm text-navy-400">No real fixtures found for this gameweek yet.</p>
        ) : (
          <div className="mt-6 flex flex-col gap-3">
            {(fixtureRows ?? []).map((f) => {
              const home = f.teams_home as unknown as TeamRow;
              const away = f.teams_away as unknown as TeamRow;
              const homeSide = buildSide(home, away.id, true);
              const awaySide = buildSide(away, home.id, false);
              const entries = clubFixturesByTeam.get(home.id) ?? [];
              const match = entries.find((e) => e.gameweek === selectedGameweek && e.opponent_team_id === away.id);
              return (
                <FixtureCard
                  key={f.id}
                  kickoffAt={f.kickoff_at}
                  home={homeSide}
                  away={awaySide}
                  drawProb={match?.draw_prob ?? null}
                  homeProjected={projectedByTeam.get(home.id) ?? []}
                  awayProjected={projectedByTeam.get(away.id) ?? []}
                />
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
