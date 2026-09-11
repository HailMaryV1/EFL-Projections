import { notFound } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabaseServerClient";
import { type FixtureEntry, formatFixture, fdrColor } from "@/lib/fixtures";
import SiteHeader from "../../SiteHeader";
import TeamBadge, { type TeamBadgeInfo } from "../../TeamBadge";

const HORIZONS = [1, 2, 3, 5] as const;
const LAYER_LABELS: Record<string, string> = { form: "Form", fixture_quantity: "Fixture Quantity", fixture_quality: "Fixture Quality", live_odds: "Live Odds" };
const COMPETITION_LABELS: Record<string, string> = { championship: "Championship", league_one: "League One", league_two: "League Two" };

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const playerId = Number(id);
  const supabase = await createAuthServerClient();

  const { data: playerRow } = await supabase
    .from("players")
    .select("id, full_name, position, ownership_pct, status, injury_status, suspension_detail, teams!team_id(name, competition, abbreviation, background_color, text_color)")
    .eq("id", playerId)
    .maybeSingle();
  if (!playerRow) notFound();

  type TeamJoin = { name: string; competition: string; abbreviation: string; background_color: string; text_color: string } | null;
  const player = playerRow as unknown as { id: number; full_name: string; position: string; ownership_pct: number | null; status: string | null; injury_status: string | null; suspension_detail: string | null; teams: TeamJoin };
  const team: TeamBadgeInfo & { name: string } = {
    name: player.teams?.name ?? "—",
    abbreviation: player.teams?.abbreviation ?? null,
    backgroundColor: player.teams?.background_color ?? null,
    textColor: player.teams?.text_color ?? null,
  };

  const { data: seasonRow } = await supabase
    .from("player_stats")
    .select("goals, assists, key_passes, shots_on_target, clean_sheets, clearances, blocks, tackles, interceptions, saves, yellow_cards, red_cards, own_goals, missed_penalties, games_played, total_points")
    .eq("player_id", playerId)
    .is("gameweek", null)
    .maybeSingle();

  const { data: latestVersionRow } = await supabase.from("projections").select("algorithm_version_id").order("algorithm_version_id", { ascending: false }).limit(1).maybeSingle();
  const latestVersionId = latestVersionRow?.algorithm_version_id;

  const { data: projRows } = latestVersionId
    ? await supabase.from("projections").select("horizon, total_points, rating, per_stat, per_layer").eq("player_id", playerId).eq("algorithm_version_id", latestVersionId).in("horizon", HORIZONS as unknown as number[])
    : { data: [] };

  const byHorizon = new Map((projRows ?? []).map((r) => [r.horizon, r]));
  const horizon1 = byHorizon.get(1);
  const horizon5 = byHorizon.get(5);
  const perStat = (horizon1?.per_stat ?? {}) as Record<string, { expected_count?: number; points?: number }>;
  const perLayer = (horizon1?.per_layer ?? {}) as Record<string, { value: number | null; populated: boolean; weight?: number }>;
  const fixtures5 = ((horizon5?.per_layer as { fixture_quantity?: { fixtures?: FixtureEntry[] } })?.fixture_quantity?.fixtures ?? []).slice().sort((a, b) => a.gameweek - b.gameweek);

  return (
    <div className="flex flex-1 flex-col sm:flex-row">
      <SiteHeader />
      <main className="mx-auto w-full min-w-0 max-w-3xl flex-1 p-6">
        <div className="flex items-center gap-4">
          <TeamBadge team={team} size="lg" />
          <div>
            <h1 className="font-[family-name:var(--font-cond)] text-3xl font-extrabold uppercase text-navy-100">{player.full_name}</h1>
            <p className="text-sm text-navy-400">
              {team.name} · {player.position}
              {player.teams?.competition && ` · ${COMPETITION_LABELS[player.teams.competition] ?? player.teams.competition}`}
            </p>
          </div>
        </div>

        {(player.injury_status || player.suspension_detail) && (
          <div className="mt-4 rounded-lg border border-amber-900/60 bg-amber-950/20 p-3 text-sm text-amber-300">
            {player.injury_status && <p>Injury: {player.injury_status}</p>}
            {player.suspension_detail && <p>Suspension: {player.suspension_detail}</p>}
          </div>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {HORIZONS.map((h) => {
            const row = byHorizon.get(h);
            return (
              <div key={h} className="rounded-lg border border-navy-800 bg-navy-900 p-4">
                <p className="font-[family-name:var(--font-cond)] text-2xl font-bold text-navy-100">{row ? Number(row.total_points).toFixed(1) : "—"}</p>
                <p className="text-xs text-navy-400">{h === 1 ? "This GW" : `Next ${h} GWs`}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Rating" value={horizon1?.rating !== undefined && horizon1?.rating !== null ? Number(horizon1.rating).toFixed(1) : "—"} />
          <Stat label="Owned" value={player.ownership_pct !== null ? `${Number(player.ownership_pct).toFixed(1)}%` : "—"} />
          <Stat label="Season Pts" value={seasonRow?.total_points ?? "—"} />
          <Stat label="Games" value={seasonRow?.games_played ?? 0} />
        </div>

        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-navy-300">Real season stats</h2>
          <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6">
            <Stat label="Goals" value={seasonRow?.goals ?? 0} />
            <Stat label="Assists" value={seasonRow?.assists ?? 0} />
            <Stat label="Key Passes" value={seasonRow?.key_passes ?? 0} />
            <Stat label="Shots OT" value={seasonRow?.shots_on_target ?? 0} />
            <Stat label="Clean Sheets" value={seasonRow?.clean_sheets ?? 0} />
            <Stat label="Saves" value={seasonRow?.saves ?? 0} />
            <Stat label="Clearances" value={seasonRow?.clearances ?? 0} />
            <Stat label="Blocks" value={seasonRow?.blocks ?? 0} />
            <Stat label="Tackles" value={seasonRow?.tackles ?? 0} />
            <Stat label="Interceptions" value={seasonRow?.interceptions ?? 0} />
            <Stat label="Yellow Cards" value={seasonRow?.yellow_cards ?? 0} />
            <Stat label="Red Cards" value={seasonRow?.red_cards ?? 0} />
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-navy-300">Why this gameweek&rsquo;s projection is what it is</h2>
          <p className="mt-1 text-xs text-navy-500">Read directly from the engine&rsquo;s own stored breakdown - never recomputed here.</p>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-navy-800 bg-navy-900 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-400">Per-stat expected points</p>
              <ul className="space-y-1 text-sm">
                {Object.entries(perStat)
                  .filter(([, v]) => v && typeof v.points === "number")
                  .sort((a, b) => (b[1].points ?? 0) - (a[1].points ?? 0))
                  .map(([stat, v]) => (
                    <li key={stat} className="flex items-center justify-between gap-2">
                      <span className="text-navy-300">{stat.replace(/_/g, " ")}</span>
                      <span className="font-mono tabular-nums text-navy-100">
                        {v.points!.toFixed(2)}
                        {v.expected_count !== undefined && <span className="ml-1 text-navy-500">({v.expected_count.toFixed(2)}x)</span>}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
            <div className="rounded-lg border border-navy-800 bg-navy-900 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-400">The five layers</p>
              <ul className="space-y-1.5 text-sm">
                <li className="flex items-center justify-between gap-2">
                  <span className="text-navy-300">Xmins</span>
                  <span className="font-mono tabular-nums text-navy-100">{perLayer.xmins?.value !== null && perLayer.xmins?.value !== undefined ? perLayer.xmins.value.toFixed(2) : "—"}</span>
                </li>
                {Object.entries(LAYER_LABELS).map(([key, label]) => {
                  const cell = perLayer[key];
                  return (
                    <li key={key} className="flex items-center justify-between gap-2">
                      <span className="text-navy-300">{label}</span>
                      <span className="font-mono tabular-nums text-navy-100">{cell?.populated && cell.value !== null ? cell.value.toFixed(2) : "not populated"}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </section>

        <section className="mt-8 mb-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-navy-300">Upcoming fixtures</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {fixtures5.map((f) => {
              const color = fdrColor(f.opponent_fdr) ?? "#7e93ab";
              return (
                <div key={`${f.gameweek}-${f.opponent}`} className="rounded-lg border border-navy-800 bg-navy-900 p-3 text-center" title={formatFixture(f)}>
                  <p className="text-[10px] uppercase tracking-wide text-navy-500">GW{f.gameweek}</p>
                  <p className="mt-1 truncate font-[family-name:var(--font-cond)] text-sm font-bold" style={{ color }}>
                    {f.is_home ? "" : "@"}
                    {f.opponent}
                  </p>
                </div>
              );
            })}
            {fixtures5.length === 0 && <p className="col-span-full text-sm text-navy-400">No real upcoming fixtures found yet.</p>}
          </div>
        </section>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-navy-800 bg-navy-900 p-3">
      <p className="font-mono text-lg font-bold tabular-nums text-navy-100">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-navy-400">{label}</p>
    </div>
  );
}
