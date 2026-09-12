import Link from "next/link";
import { createServiceSupabaseClient } from "@/lib/supabaseServiceClient";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { type Segment, type PointsPair, buildSegment, mae, medianAbsoluteError, rmse, bias, errorBuckets, SMALL_SAMPLE_THRESHOLD } from "@/lib/accuracyMetrics";

// Deliberately NOT a port of dreamteam-projections' own admin/accuracy/
// page.tsx - that page's fixture-load segmentation, minutes-band
// segmentation, minutes-model-era cutoff, DEF clean-sheet-confidence
// diagnostics and naive-baseline comparison all depend on columns/concepts
// this project's schema genuinely doesn't have: no `predicted_xmins_
// fraction`/`predicted_fixture_count`/`predicted_clean_sheet_expected` on
// `predictions_and_actuals` (migration 0013 is the simpler original shape -
// see its own comment), and no raw per-match minutes anywhere in
// `player_stats` at all (migration 0003's own comment; also see
// docs/data-and-weights.md "Known limitations"). Building placeholder
// versions of those sections here would be exactly the kind of fabricated
// number this project's own CLAUDE.md rules out - so this page is scoped
// to what the real frozen/captured data can actually support: headline
// error stats, a position breakdown, and a real per-gameweek predicted-
// vs-actual table, for both the player and club prediction pipelines.

type PlayerSummaryRow = {
  player_id: number;
  gameweek: number;
  predicted_points: number;
  actual_points: number | null;
  players: { position: string } | null;
};

type ClubSummaryRow = {
  team_id: number;
  gameweek: number;
  predicted_points: number;
  actual_points: number | null;
};

type PlayerDetailRow = {
  player_id: number;
  gameweek: number;
  predicted_points: number;
  actual_points: number | null;
  players: { full_name: string; teams: { name: string } | null } | null;
};

type ClubDetailRow = {
  team_id: number;
  gameweek: number;
  predicted_points: number;
  actual_points: number | null;
  teams: { name: string } | null;
};

const POSITIONS = ["GK", "DEF", "MID", "FWD"] as const;

function toPair(r: { predicted_points: number; actual_points: number | null }): PointsPair {
  return { predicted: Number(r.predicted_points), actual: Number(r.actual_points) };
}

function fmt(n: number | null) {
  return n !== null ? n.toFixed(2) : "—";
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-lg border border-navy-800 bg-navy-900 p-4">
      <p className="text-2xl font-semibold tabular-nums text-navy-100">{value}</p>
      <p className="text-xs text-navy-300">{label}</p>
      {hint && <p className="mt-0.5 text-[11px] text-navy-500">{hint}</p>}
    </div>
  );
}

function BucketStat({ label, value, isWorst = false }: { label: string; value: number; isWorst?: boolean }) {
  return (
    <div className="rounded-lg border border-navy-800 bg-navy-900 p-3">
      <p className={`text-xl font-semibold tabular-nums ${isWorst ? "text-navy-300" : "text-emerald-400"}`}>{value.toFixed(1)}%</p>
      <p className="mt-0.5 text-[11px] text-navy-400">{label}</p>
    </div>
  );
}

function SmallSampleTag({ n }: { n: number }) {
  if (n >= SMALL_SAMPLE_THRESHOLD) return null;
  return (
    <span
      className="ml-1.5 rounded-full bg-navy-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-navy-500"
      title={`Only ${n} real captured results - treat this number with more caution than a larger sample.`}
    >
      Small sample
    </span>
  );
}

function SegmentBreakdown({ title, note, segments }: { title: string; note: string; segments: Segment[] }) {
  const ranked = segments.filter((s) => s.n > 0).sort((a, b) => (b.mae ?? 0) - (a.mae ?? 0));
  const worstMae = ranked[0]?.mae ?? 0;
  return (
    <div className="rounded-lg border border-navy-800 bg-navy-900 p-4">
      <p className="text-sm font-semibold text-navy-100">{title}</p>
      <p className="mt-0.5 text-xs text-navy-400">{note}</p>
      <div className="mt-3 flex flex-col gap-2.5">
        {ranked.map((s) => (
          <div key={s.label}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-sm">
              <span className="text-navy-200">
                {s.label}
                <SmallSampleTag n={s.n} />
              </span>
              <span className="tabular-nums text-navy-100">
                {s.mae !== null ? s.mae.toFixed(2) : "—"} <span className="text-xs text-navy-500">MAE · n={s.n}</span>
                {s.bias !== null && (
                  <span className={`ml-2 text-xs ${s.bias > 0.1 ? "text-amber-400" : s.bias < -0.1 ? "text-sky-400" : "text-navy-500"}`}>
                    {s.bias > 0 ? "+" : ""}
                    {s.bias.toFixed(2)} bias
                  </span>
                )}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-navy-800">
              <div className="h-full rounded-full bg-rose-400" style={{ width: worstMae > 0 ? `${((s.mae ?? 0) / worstMae) * 100}%` : "0%" }} />
            </div>
          </div>
        ))}
        {ranked.length === 0 && <p className="text-xs text-navy-500">Not enough real captured results yet.</p>}
      </div>
    </div>
  );
}

function HeadlineStats({ frozen, captured }: { frozen: number; captured: PointsPair[] }) {
  const overallMae = mae(captured);
  const overallMedianAe = medianAbsoluteError(captured);
  const overallRmse = rmse(captured);
  const overallBias = bias(captured);
  const buckets = errorBuckets(captured);
  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Predictions frozen" value={frozen} />
        <Stat label="Results captured" value={captured.length} />
        <Stat label="Mean absolute error" value={fmt(overallMae)} />
        <Stat label="Median absolute error" value={fmt(overallMedianAe)} />
        <Stat label="RMSE" value={fmt(overallRmse)} />
        <Stat
          label="Model bias"
          value={overallBias !== null ? `${overallBias > 0 ? "+" : ""}${overallBias.toFixed(2)}` : "—"}
          hint={overallBias === null ? undefined : overallBias > 0.1 ? "Slight over-projection" : overallBias < -0.1 ? "Slight under-projection" : "Well centred"}
        />
      </div>
      <div className="mt-4">
        <p className="text-xs text-navy-500">Share of every real captured prediction landing within a given number of points of what actually happened.</p>
        {buckets ? (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <BucketStat label="Within ±1pt" value={buckets.within1} />
            <BucketStat label="Within ±2pt" value={buckets.within2} />
            <BucketStat label="Within ±3pt" value={buckets.within3} />
            <BucketStat label="Within ±5pt" value={buckets.within5} />
            <BucketStat label="More than 5pt away" value={buckets.beyond5} isWorst />
          </div>
        ) : (
          <p className="mt-3 text-xs text-navy-500">Not enough real captured results yet.</p>
        )}
      </div>
    </>
  );
}

export default async function AdminAccuracyPage({ searchParams }: { searchParams: Promise<{ gameweek?: string; clubGameweek?: string }> }) {
  const params = await searchParams;
  const supabase = createServiceSupabaseClient();

  // Both summary fetches are range-paginated through supabasePaginate's
  // shared `fetchAllRows` - REAL bug dreamteam-projections hit for real
  // (2026-09-11): a plain unbounded .select() over predictions_and_actuals
  // silently truncates at PostgREST's 1000-row default once enough
  // gameweeks are frozen. freeze_predictions.py alone writes one row per
  // player (3570) per gameweek here, so this project clears that cap even
  // faster than PL's ~576-player version did - baked in from day one
  // rather than waiting to hit it live.
  const [playerSummary, clubSummary] = await Promise.all([
    fetchAllRows<PlayerSummaryRow>(
      (from, to) =>
        supabase
          .from("predictions_and_actuals")
          .select("player_id, gameweek, predicted_points, actual_points, players!inner(position)")
          .range(from, to) as unknown as PromiseLike<{ data: PlayerSummaryRow[] | null; error: { message: string } | null }>
    ),
    fetchAllRows<ClubSummaryRow>((from, to) =>
      supabase.from("club_predictions_and_actuals").select("team_id, gameweek, predicted_points, actual_points").range(from, to)
    ),
  ]);

  const playerCaptured = playerSummary.filter((r) => r.actual_points !== null);
  const clubCaptured = clubSummary.filter((r) => r.actual_points !== null);

  const positionSegments: Segment[] = POSITIONS.map((pos) =>
    buildSegment(pos, playerCaptured.filter((r) => r.players?.position === pos).map(toPair))
  );

  const playerGameweeks = Array.from(new Set(playerSummary.map((r) => r.gameweek))).sort((a, b) => b - a);
  const clubGameweeks = Array.from(new Set(clubSummary.map((r) => r.gameweek))).sort((a, b) => b - a);
  const selectedPlayerGw = params.gameweek ? Number(params.gameweek) : playerGameweeks[0];
  const selectedClubGw = params.clubGameweek ? Number(params.clubGameweek) : clubGameweeks[0];

  // Scoped to one gameweek each - still range-paginated (a single
  // gameweek here can hold all 3570 real players, past the 1000-row cap
  // on its own) rather than filtering the already-fetched summary above,
  // which lacks the player/team names this table needs to display.
  const playerDetail =
    selectedPlayerGw !== undefined
      ? await fetchAllRows<PlayerDetailRow>(
          (from, to) =>
            supabase
              .from("predictions_and_actuals")
              .select("player_id, gameweek, predicted_points, actual_points, players!inner(full_name, teams!team_id(name))")
              .eq("gameweek", selectedPlayerGw)
              .order("predicted_points", { ascending: false })
              .range(from, to) as unknown as PromiseLike<{ data: PlayerDetailRow[] | null; error: { message: string } | null }>
        )
      : [];

  const clubDetail =
    selectedClubGw !== undefined
      ? await fetchAllRows<ClubDetailRow>(
          (from, to) =>
            supabase
              .from("club_predictions_and_actuals")
              .select("team_id, gameweek, predicted_points, actual_points, teams!team_id(name)")
              .eq("gameweek", selectedClubGw)
              .order("predicted_points", { ascending: false })
              .range(from, to) as unknown as PromiseLike<{ data: ClubDetailRow[] | null; error: { message: string } | null }>
        )
      : [];

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl">
      <h1 className="text-2xl font-semibold text-navy-100">Prediction Accuracy</h1>
      <p className="mt-1 text-sm text-navy-300">
        Every prediction is frozen the moment it&rsquo;s made - before kickoff - and never edited again. This is what the model actually said, compared to what
        really happened.
      </p>
      <p className="mt-2 max-w-2xl text-xs text-navy-500">
        No minutes-based diagnostics on this page - this project&rsquo;s <code className="text-navy-400">player_stats</code> has no raw per-match minutes field
        (only a 0/1 appearance flag), so a real expected-minutes-vs-actual breakdown isn&rsquo;t buildable yet (see docs/data-and-weights.md &ldquo;Known
        limitations&rdquo;). A fabricated version of that breakdown isn&rsquo;t shown here instead.
      </p>

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-navy-400">Player predictions</h2>
        <HeadlineStats frozen={playerSummary.length} captured={playerCaptured.map(toPair)} />

        <div className="mt-6">
          <SegmentBreakdown title="Position" note="Which position is hardest to price correctly right now?" segments={positionSegments} />
        </div>

        <div className="mt-6 flex flex-wrap gap-1">
          {playerGameweeks.map((gw) => (
            <Link
              key={gw}
              href={`/admin/accuracy?gameweek=${gw}${params.clubGameweek ? `&clubGameweek=${params.clubGameweek}` : ""}`}
              className={`rounded-md px-3 py-1.5 text-sm ${gw === selectedPlayerGw ? "bg-sky-600 text-white" : "bg-navy-900 text-navy-200 hover:bg-navy-800"}`}
            >
              GW{gw}
            </Link>
          ))}
        </div>

        {playerDetail.length === 0 ? (
          <p className="mt-4 text-sm text-navy-400">No frozen player predictions for this gameweek yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-navy-800 text-left text-xs uppercase tracking-wide text-navy-400">
                  <th className="py-2 pr-4">Player</th>
                  <th className="py-2 pr-4">Team</th>
                  <th className="py-2 pr-4">Predicted</th>
                  <th className="py-2 pr-4">Actual</th>
                  <th className="py-2">Error</th>
                </tr>
              </thead>
              <tbody>
                {playerDetail.map((r) => {
                  const hasActual = r.actual_points !== null;
                  const error = hasActual ? Number(r.actual_points) - Number(r.predicted_points) : null;
                  return (
                    <tr key={r.player_id} className="border-b border-navy-800/60">
                      <td className="py-2 pr-4 font-medium text-navy-100">{r.players?.full_name ?? "—"}</td>
                      <td className="py-2 pr-4 text-navy-300">{r.players?.teams?.name ?? "—"}</td>
                      <td className="py-2 pr-4 tabular-nums text-navy-100">{Number(r.predicted_points).toFixed(2)}</td>
                      <td className="py-2 pr-4 tabular-nums text-navy-100">{hasActual ? Number(r.actual_points).toFixed(2) : "not played yet"}</td>
                      <td className={`py-2 tabular-nums ${error !== null && error < 0 ? "text-rose-400" : error !== null && error > 0 ? "text-emerald-400" : "text-navy-100"}`}>
                        {error !== null ? (error > 0 ? `+${error.toFixed(2)}` : error.toFixed(2)) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-10 border-t border-navy-800 pt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-navy-400">Club predictions</h2>
        <p className="mt-1 max-w-2xl text-xs text-navy-500">
          No equivalent in dreamteam-projections - Fantasy EFL&rsquo;s club picks (win/draw/away win/clean sheet/2+/4+ goals) score independently of players, so
          their real accuracy is tracked separately here.
        </p>
        <HeadlineStats frozen={clubSummary.length} captured={clubCaptured.map(toPair)} />

        <div className="mt-6 flex flex-wrap gap-1">
          {clubGameweeks.map((gw) => (
            <Link
              key={gw}
              href={`/admin/accuracy?clubGameweek=${gw}${params.gameweek ? `&gameweek=${params.gameweek}` : ""}`}
              className={`rounded-md px-3 py-1.5 text-sm ${gw === selectedClubGw ? "bg-sky-600 text-white" : "bg-navy-900 text-navy-200 hover:bg-navy-800"}`}
            >
              GW{gw}
            </Link>
          ))}
        </div>

        {clubDetail.length === 0 ? (
          <p className="mt-4 text-sm text-navy-400">No frozen club predictions for this gameweek yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-navy-800 text-left text-xs uppercase tracking-wide text-navy-400">
                  <th className="py-2 pr-4">Club</th>
                  <th className="py-2 pr-4">Predicted</th>
                  <th className="py-2 pr-4">Actual</th>
                  <th className="py-2">Error</th>
                </tr>
              </thead>
              <tbody>
                {clubDetail.map((r) => {
                  const hasActual = r.actual_points !== null;
                  const error = hasActual ? Number(r.actual_points) - Number(r.predicted_points) : null;
                  return (
                    <tr key={r.team_id} className="border-b border-navy-800/60">
                      <td className="py-2 pr-4 font-medium text-navy-100">{r.teams?.name ?? "—"}</td>
                      <td className="py-2 pr-4 tabular-nums text-navy-100">{Number(r.predicted_points).toFixed(2)}</td>
                      <td className="py-2 pr-4 tabular-nums text-navy-100">{hasActual ? Number(r.actual_points).toFixed(2) : "not played yet"}</td>
                      <td className={`py-2 tabular-nums ${error !== null && error < 0 ? "text-rose-400" : error !== null && error > 0 ? "text-emerald-400" : "text-navy-100"}`}>
                        {error !== null ? (error > 0 ? `+${error.toFixed(2)}` : error.toFixed(2)) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
