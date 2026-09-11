import { createAuthServerClient } from "@/lib/supabaseServerClient";
import { type FixtureEntry } from "@/lib/fixtures";
import { type ComparePlayer } from "@/app/compare/CompareView";

const HORIZONS = [1, 2, 3, 5] as const;

export async function loadComparePlayer(supabase: Awaited<ReturnType<typeof createAuthServerClient>>, playerId: number): Promise<ComparePlayer | null> {
  const { data: playerRow } = await supabase
    .from("players")
    .select("id, full_name, position, ownership_pct, teams!team_id(name, abbreviation, background_color, text_color)")
    .eq("id", playerId)
    .maybeSingle();
  if (!playerRow) return null;
  type TeamJoin = { name: string; abbreviation: string; background_color: string; text_color: string } | null;
  type PRow = { id: number; full_name: string; position: ComparePlayer["position"]; ownership_pct: number | null; teams: TeamJoin };
  const p = playerRow as unknown as PRow;

  // Real bug found live: compute_player_projections.py and
  // compute_club_projections.py share ONE algorithm_versions table (by
  // design - "one version numbering scheme for the whole project", see
  // CLAUDE.md), so the table's own globally-latest id can belong to
  // whichever engine happened to run last - not necessarily one with any
  // real player projections. The correct "latest" is always the max
  // algorithm_version_id actually present on the table being queried, the
  // same pattern every other page (Projected Points, Fixtures, Best
  // Squad) already uses - never algorithm_versions directly for this.
  const { data: latestVersionRow } = await supabase.from("projections").select("algorithm_version_id").order("algorithm_version_id", { ascending: false }).limit(1).maybeSingle();
  const algorithmVersionId = latestVersionRow?.algorithm_version_id;

  const { data: projRows } = algorithmVersionId
    ? await supabase.from("projections").select("horizon, rating, per_layer, total_points").eq("player_id", playerId).eq("algorithm_version_id", algorithmVersionId).in("horizon", HORIZONS as unknown as number[])
    : { data: [] };

  const pointsByHorizon: Record<number, number | null> = { 1: null, 2: null, 3: null, 5: null };
  let fixtures: ComparePlayer["fixtures"] = [];
  let rating: number | null = null;
  for (const row of projRows ?? []) {
    pointsByHorizon[row.horizon] = Number(row.total_points);
    if (row.horizon === 1) rating = row.rating === null ? null : Number(row.rating);
    if (row.horizon === 5) {
      const fq = (row.per_layer as { fixture_quantity?: { fixtures?: FixtureEntry[] } })?.fixture_quantity;
      fixtures = (fq?.fixtures ?? []).slice().sort((x, y) => x.gameweek - y.gameweek).slice(0, 5);
    }
  }

  const { data: seasonStatsRow } = await supabase.from("player_stats").select("goals, assists, games_played, total_points").eq("player_id", playerId).eq("season", "2026/27").is("gameweek", null).maybeSingle();

  return {
    id: p.id,
    name: p.full_name,
    position: p.position,
    team: {
      name: p.teams?.name ?? "—",
      abbreviation: p.teams?.abbreviation ?? null,
      backgroundColor: p.teams?.background_color ?? null,
      textColor: p.teams?.text_color ?? null,
    },
    ownershipPct: p.ownership_pct === null ? null : Number(p.ownership_pct),
    pointsByHorizon,
    fixtures,
    seasonPointsSoFar: Number(seasonStatsRow?.total_points ?? 0),
    gamesPlayed: seasonStatsRow?.games_played ?? 0,
    goals: seasonStatsRow?.goals ?? 0,
    assists: seasonStatsRow?.assists ?? 0,
    rating,
  };
}
