import { createAuthServerClient } from "@/lib/supabaseServerClient";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { type SquadCandidate, type ClubCandidate } from "@/lib/squadBuilder";
import MySquadBuilder from "./MySquadBuilder";

const HORIZON_LABELS: Record<string, string> = { "1": "This gameweek", "2": "Next 2 gameweeks", "3": "Next 3 gameweeks", "5": "Next 5 gameweeks" };

// fantasy.efl.com's own "My team" page needs your personal login to view -
// confirmed live there's no public, shareable team-ID URL (unlike some
// other fantasy platforms), so there's no real way to import a squad
// automatically without handling a real login on your behalf (never done
// here). This is the honest alternative: pick your real 7 players + 2
// clubs yourself, no account needed - your picks are saved in this
// browser only (localStorage), never sent anywhere.
export default async function MySquadPage({ searchParams }: { searchParams: Promise<{ horizon?: string }> }) {
  const params = await searchParams;
  const horizon = params.horizon && params.horizon !== "1" ? Number(params.horizon) : 1;
  const supabase = await createAuthServerClient();

  const { data: latestVersionRow } = await supabase.from("projections").select("algorithm_version_id").order("algorithm_version_id", { ascending: false }).limit(1).maybeSingle();
  const latestVersionId = latestVersionRow?.algorithm_version_id;

  const { data: gameweekRows } = latestVersionId
    ? await supabase.from("projections").select("gameweek").eq("horizon", horizon).eq("algorithm_version_id", latestVersionId).limit(1)
    : { data: [] };
  const gameweek = gameweekRows?.[0]?.gameweek ?? null;

  type PlayerJoin = { full_name: string; position: string; ownership_pct: number | null; teams: { id: number; name: string; abbreviation: string; background_color: string; text_color: string } | null };
  type ProjectionRow = { total_points: number; rating: number | null; player_id: number; players: PlayerJoin };

  // Same full-pool fetch HM Best Squad already does (range-paginated past
  // PostgREST's 1000-row cap) - a manual picker needs every real active
  // player searchable, not just a top-N slice.
  const rows =
    latestVersionId && gameweek !== null
      ? await fetchAllRows<ProjectionRow>((from, to) =>
          supabase
            .from("projections")
            .select("total_points, rating, player_id, players!inner(full_name, position, ownership_pct, teams!team_id(id, name, abbreviation, background_color, text_color))")
            .eq("horizon", horizon)
            .eq("gameweek", gameweek)
            .eq("algorithm_version_id", latestVersionId)
            .order("player_id") // stable pagination tiebreaker - see best-squad/page.tsx's own fix for the full reasoning
            .range(from, to) as unknown as PromiseLike<{ data: ProjectionRow[] | null; error: { message: string } | null }>
        )
      : [];

  const players: SquadCandidate[] = rows
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

  const { data: latestClubVersionRow } = await supabase.from("club_projections").select("algorithm_version_id").order("algorithm_version_id", { ascending: false }).limit(1).maybeSingle();
  const latestClubVersionId = latestClubVersionRow?.algorithm_version_id;
  const { data: clubRows } =
    latestClubVersionId && gameweek !== null
      ? await supabase
          .from("club_projections")
          .select("total_points, team_id, teams!inner(id, name, abbreviation, background_color, text_color)")
          .eq("horizon", horizon)
          .eq("gameweek", gameweek)
          .eq("algorithm_version_id", latestClubVersionId)
      : { data: [] };
  type TeamJoin = { id: number; name: string; abbreviation: string; background_color: string; text_color: string };
  type ClubRow = { total_points: number; team_id: number; teams: TeamJoin };
  const clubs: (ClubCandidate & { team: TeamJoin })[] = ((clubRows ?? []) as unknown as ClubRow[]).map((r) => ({
    teamId: r.team_id,
    teamName: r.teams.name,
    points: Number(r.total_points),
    team: r.teams,
  }));

  return (
    <main className="mx-auto w-full min-w-0 max-w-5xl flex-1 p-6">
      <h1 className="text-2xl font-semibold text-navy-100">My Squad</h1>
      <p className="mt-1 max-w-2xl text-sm text-navy-300">
        Fantasy EFL&rsquo;s own site needs your login to see your real team, and has no public way to share it - so build it
        here instead: pick your real 7 players and 2 club picks, and see their real projections. Saved in this browser only,
        no account needed.
      </p>

      <div className="mt-4 flex flex-wrap gap-1 text-xs">
        {Object.entries(HORIZON_LABELS).map(([value, label]) => (
          <a
            key={value}
            href={`/my-squad?horizon=${value}`}
            className={`rounded-md px-2 py-1 ${Number(value) === horizon ? "bg-navy-800 font-medium text-navy-100" : "text-navy-400 hover:text-navy-100"}`}
          >
            {label}
          </a>
        ))}
      </div>

      {players.length === 0 ? (
        <p className="mt-8 text-sm text-navy-400">No projections available yet.</p>
      ) : (
        <div className="mt-6">
          <MySquadBuilder players={players} clubs={clubs} />
        </div>
      )}
    </main>
  );
}
