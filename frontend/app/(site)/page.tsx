import Link from "next/link";
import Image from "next/image";
import { createAuthServerClient } from "@/lib/supabaseServerClient";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { type FixtureEntry, formatFixture } from "@/lib/fixtures";
import { mae, errorBuckets, type PointsPair } from "@/lib/accuracyMetrics";
import { buildBestSquad, type SquadCandidate } from "@/lib/squadBuilder";
import { loadComparePlayer } from "@/lib/comparePlayer";
import BrowserFrame from "../BrowserFrame";
import Reveal from "../Reveal";
import ScaleToFit from "../ScaleToFit";
import TeamBadge, { type TeamBadgeInfo } from "../TeamBadge";
import ProjectionsTable from "./projected-points/ProjectionsTable";
import PitchSquad from "./best-squad/PitchSquad";
import FixtureCard, { type FixtureSide, type ProjectedPlayer } from "./fixtures/FixtureCard";
import TopFiveCard, { type TopFiveEntry } from "./top-picks/TopFiveCard";
import CompareView from "./compare/CompareView";

type TeamRef = TeamBadgeInfo & { id: number; name: string };

const COMPETITION_LABELS: Record<string, string> = { championship: "Championship", league_one: "League One", league_two: "League Two" };

// Same real percentile-based confidence bar every Hail Mary product uses
// for a "differential" pick - under this real ownership%, a player counts
// as a genuine punt rather than a template selection. No shared constant
// to import here (dreamteam-projections' own version lives in
// lib/elevenBuilder.ts, which has no EFL equivalent - this project's
// squadBuilder.ts has no XI-style-selection concept at all, since there's
// no budget to build "styles" around), so it's defined locally.
const DIFFERENTIAL_OWNERSHIP_CEILING = 10;

const LAYERS = [
  { name: "Xmins", description: "Live lineups, appearance rate, cup-rotation." },
  { name: "Form", description: "Recency-decayed, shrunk to a season prior." },
  { name: "Fixture Qty", description: "Real doubles and blanks, correctly counted." },
  { name: "Fixture Quality", description: "Market odds and fixture-difficulty ratings." },
  { name: "Live Odds", description: "Bookmaker shots, tackles, clean sheets." },
];

// A large, faint ghosted number sitting behind a showcase section - real
// live data (this gameweek's own top score, win probability, etc.), not a
// decorative index. Ported from dreamteam-projections.
function GhostNumber({ text, className = "" }: { text: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute font-[family-name:var(--font-cond)] font-extrabold text-navy-900 select-none ${className}`}
      style={{ WebkitTextStroke: "1px color-mix(in srgb, var(--color-navy-700) 70%, transparent)", color: "transparent" }}
    >
      {text}
    </span>
  );
}

// A faint angular flag shape echoing the HM mark's own chevron geometry -
// deliberately abstract/low-opacity rather than the actual raster logo, so
// it reads as texture, not a second brand mark competing with the real one
// in the sidebar/hero. Ported from dreamteam-projections.
function ChevronMark({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 100 100" className={`pointer-events-none absolute text-navy-800 ${className}`} fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M14 92 L50 12 L86 92 L50 64 Z" />
    </svg>
  );
}

function LivePulseDot({ color = "bg-emerald-400" }: { color?: string }) {
  return (
    <span className="relative flex h-2 w-2">
      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${color} opacity-75`} />
      <span className={`relative inline-flex h-2 w-2 rounded-full ${color}`} />
    </span>
  );
}

// The divider-per-item border is sm:-only (see globals.css's own reveal
// discipline) - once the row wraps onto a second mobile line, an
// unconditional border would leave a stray vertical line on the wrapped
// line's first item with nothing to divide. Mobile relies on the parent's
// own gap for spacing instead. Ported from dreamteam-projections.
function TickerStat({ label, value, first = false }: { label: string; value: string; first?: boolean }) {
  return (
    <div className={`flex items-baseline gap-2 ${first ? "" : "sm:border-l sm:border-navy-800 sm:pl-4 md:pl-6"}`}>
      <span className="animate-rise font-[family-name:var(--font-cond)] text-xl font-extrabold tabular-nums text-navy-100 sm:text-2xl">{value}</span>
      <span className="text-[11px] tracking-wide text-navy-500 uppercase sm:text-xs">{label}</span>
    </div>
  );
}

// A single "signal" from the live model - deliberately terminal/feed-like
// (emoji glyph, one clean fact, one big number) rather than a stat-report
// tile. Carries a real TeamBadge, same colour-coded club chip used
// throughout the tools. Adapted from dreamteam-projections' version, which
// takes a bare team-name string (only viable there because it hardcodes a
// 20-club branding map) - this takes the same real per-club colour object
// every other component on this site already uses for its 72 clubs.
function IntelCard({ href, emoji, label, team, name, meta, value, valueLabel, accent }: { href: string; emoji: string; label: string; team: TeamRef; name: string; meta?: string; value: string; valueLabel?: string; accent: string }) {
  return (
    <Link
      href={href}
      className="group relative flex flex-1 flex-col overflow-hidden rounded-2xl border border-navy-800 bg-navy-900 p-4 transition-all duration-200 hover:-translate-y-1.5 hover:border-navy-600 sm:p-5"
    >
      <div className="pointer-events-none absolute -top-10 -right-10 h-28 w-28 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100" style={{ background: accent }} />
      <div className="relative flex items-center justify-between">
        <span className="text-xl leading-none">{emoji}</span>
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-navy-600 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-sky-300">
          <path d="M7 17L17 7M9 7h8v8" />
        </svg>
      </div>
      <p className="relative mt-3 font-[family-name:var(--font-cond)] text-[11px] font-bold tracking-[0.14em] text-navy-500 uppercase">{label}</p>
      <div className="relative mt-1 flex min-w-0 items-center gap-2">
        <TeamBadge team={team} size="sm" />
        <p className="min-w-0 truncate font-[family-name:var(--font-cond)] text-lg font-extrabold text-navy-100 uppercase sm:text-xl">{name}</p>
      </div>
      {meta && <p className="relative truncate text-xs text-navy-500">{meta}</p>}
      <p className="relative mt-3 animate-rise font-mono text-2xl font-bold tabular-nums sm:text-[28px]" style={{ color: accent }}>
        {value}
      </p>
      {valueLabel && <p className="relative mt-0.5 text-[10px] tracking-wide text-navy-500 uppercase">{valueLabel}</p>}
    </Link>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-navy-800 bg-navy-950/60 px-3 py-1.5 text-xs">
      <span className="text-[9px] tracking-wide text-navy-500 uppercase">{label} </span>
      <span className="font-mono font-bold text-navy-200">{value}</span>
    </div>
  );
}

// The gameweek's own #1 projected player, elevated into a genuinely bigger
// feature card. Adapted from dreamteam-projections - no price/£m line
// (Fantasy EFL has no budget or player prices at all), division shown
// instead.
function FeaturedPickCard({
  player,
}: {
  player: { playerId: number; name: string; team: TeamRef; position: string; competition: string; totalPoints: number; rating: number | null; ownershipPct: number | null; fixtures: FixtureEntry[] };
}) {
  const fixtureLabel = player.fixtures.length > 0 ? player.fixtures.map(formatFixture).join(" · ") : "—";
  return (
    <Link
      href="/projected-points"
      className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-orange-500/20 bg-gradient-to-br from-navy-900 via-navy-900 to-orange-950/10 p-6 transition-all duration-300 hover:-translate-y-1.5 hover:border-orange-400/45 sm:p-8 lg:col-span-2"
    >
      <div className="pointer-events-none absolute -top-20 -right-20 h-72 w-72 rounded-full bg-orange-500/15 blur-[90px] transition-opacity duration-300 group-hover:opacity-140" />
      <GhostNumber text={player.totalPoints.toFixed(1)} className="right-4 -bottom-6 text-[7rem] opacity-60 sm:text-[9rem]" />
      <div className="relative">
        <div className="flex items-center gap-2">
          <span className="text-2xl leading-none">🔥</span>
          <span className="font-[family-name:var(--font-cond)] text-xs font-bold tracking-[0.16em] text-orange-400 uppercase">Top Projected · This Gameweek</span>
        </div>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
          <div className="flex min-w-0 items-center gap-3">
            <TeamBadge team={player.team} size="md" />
            <div className="min-w-0">
              <p className="truncate font-[family-name:var(--font-cond)] text-4xl font-extrabold text-navy-50 uppercase sm:text-5xl">{player.name}</p>
              <p className="mt-1 text-sm text-navy-400">
                {player.team.name} · {player.position} · {COMPETITION_LABELS[player.competition] ?? player.competition}
              </p>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="animate-rise font-mono text-5xl leading-none font-extrabold tabular-nums text-orange-400 sm:text-6xl">{player.totalPoints.toFixed(1)}</p>
            <p className="mt-1 text-[10px] tracking-wide text-navy-500 uppercase">Projected points</p>
          </div>
        </div>
      </div>
      <div className="relative mt-6 flex flex-wrap gap-2 border-t border-navy-800/80 pt-4">
        <Chip label="Rating" value={player.rating !== null ? player.rating.toFixed(1) : "—"} />
        <Chip label="Fixture" value={fixtureLabel} />
        <Chip label="Ownership" value={player.ownershipPct !== null ? `${player.ownershipPct.toFixed(1)}%` : "—"} />
      </div>
    </Link>
  );
}

// A small, real-data "floating" card in the hero composition - deliberately
// staggered/rotated rather than stacked in a neat row. Carries a real
// TeamBadge (adapted for this project's per-club colour object, same
// reasoning as IntelCard above). Ported from dreamteam-projections.
function HeroFloatCard({
  href,
  team,
  eyebrow,
  title,
  sub,
  value,
  valueLabel,
  accent,
  className,
  delayMs,
}: {
  href: string;
  team: TeamRef;
  eyebrow: string;
  title: string;
  sub?: string;
  value: string;
  valueLabel: string;
  accent: string;
  className: string;
  delayMs: number;
}) {
  return (
    <Link
      href={href}
      className={`group absolute animate-rise rounded-2xl border border-navy-700/70 bg-navy-950/75 p-4 backdrop-blur-md transition-all duration-300 hover:-translate-y-1.5 ${className}`}
      style={{ animationDelay: `${delayMs}ms`, boxShadow: `0 25px 60px -20px rgba(0,0,0,0.85), 0 0 0 1px color-mix(in srgb, ${accent} 30%, transparent)` }}
    >
      <div className="flex items-center gap-2">
        <TeamBadge team={team} size="sm" />
        <span className="min-w-0 truncate font-[family-name:var(--font-cond)] text-[10px] font-bold tracking-[0.16em] uppercase" style={{ color: accent }}>
          {eyebrow}
        </span>
      </div>
      <p className="mt-2 truncate font-[family-name:var(--font-cond)] text-base font-extrabold text-navy-50 uppercase">{title}</p>
      {sub && <p className="truncate text-[11px] text-navy-500">{sub}</p>}
      <p className="mt-2 font-mono text-2xl font-extrabold tabular-nums" style={{ color: accent }}>
        {value}
      </p>
      <p className="text-[9px] tracking-wide text-navy-500 uppercase">{valueLabel}</p>
    </Link>
  );
}

function SectionTag({ children }: { children: React.ReactNode }) {
  return <p className="font-[family-name:var(--font-cond)] text-xs font-bold tracking-[0.16em] text-sky-400 uppercase">{children}</p>;
}

function ToolCTA({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="group mt-6 inline-flex w-fit items-center gap-2 rounded-md bg-sky-500 px-5 py-2.5 font-[family-name:var(--font-cond)] text-sm font-bold tracking-wide text-navy-950 uppercase transition-colors hover:bg-sky-300"
    >
      {label}
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="3" className="transition-transform duration-200 group-hover:translate-x-1">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </Link>
  );
}

function SecondaryCTA({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="mt-6 inline-flex w-fit items-center gap-2 rounded-md border border-navy-700 px-5 py-2.5 font-[family-name:var(--font-cond)] text-sm font-bold tracking-wide text-navy-200 uppercase transition-colors hover:border-sky-500/60 hover:text-sky-300"
    >
      {label}
    </Link>
  );
}

// Small footer bar inside a preview frame that CAN'T be wrapped in an outer
// <Link> (ProjectionsTable/PitchSquad already contain their own real
// player-page links, so nesting anchors isn't safe) - gives it the same
// "clearly clickable" affordance a fully-linked card gets.
function OpenToolBar({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="relative z-10 flex items-center justify-between border-t border-navy-800 bg-navy-950/80 px-4 py-2.5 text-xs font-semibold text-sky-300 hover:text-sky-200 hover:bg-navy-900">
      <span>{label}</span>
      <span aria-hidden>→</span>
    </Link>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-navy-800 bg-navy-950/60 px-3 py-1.5">
      <p className="font-[family-name:var(--font-cond)] text-base font-bold text-navy-100">{value}</p>
      <p className="text-[9px] tracking-wide text-navy-500 uppercase">{label}</p>
    </div>
  );
}

function EmptyPreview({ label }: { label: string }) {
  return <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-navy-800 bg-navy-900/40 p-8 text-center text-sm text-navy-500">{label}</div>;
}

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
type ClubTeamJoin = { id: number; name: string; abbreviation: string; background_color: string; text_color: string };
type ClubProjRow = { total_points: number; team_id: number; per_stat: unknown; teams: ClubTeamJoin };

function toTeamRef(t: ClubTeamJoin): TeamRef {
  return { id: t.id, name: t.name, abbreviation: t.abbreviation, backgroundColor: t.background_color, textColor: t.text_color };
}

export default async function HomePage() {
  const supabase = await createAuthServerClient();

  // ---------------------------------------------------------------------
  // Credibility numbers - real counts, plus real accuracy stats now that
  // freeze_predictions.py/capture_actuals.py actually populate
  // predictions_and_actuals (this project's own equivalent of
  // dreamteam-projections' longer-running accuracy pipeline - built this
  // same round, so real captured results are still a small early sample,
  // shown honestly as-is rather than hidden until "enough" exist).
  // ---------------------------------------------------------------------
  const [{ count: activePlayers }, { count: teamCount }, { count: predictionsFrozen }, latestVersionResult] = await Promise.all([
    supabase.from("players").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("teams").select("*", { count: "exact", head: true }),
    supabase.from("predictions_and_actuals").select("*", { count: "exact", head: true }),
    supabase.from("projections").select("algorithm_version_id").order("algorithm_version_id", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const latestVersionId = latestVersionResult.data?.algorithm_version_id;

  const capturedRows = await fetchAllRows<{ predicted_points: number; actual_points: number }>((from, to) =>
    supabase.from("predictions_and_actuals").select("predicted_points, actual_points").not("actual_points", "is", null).range(from, to)
  );
  const capturedPairs: PointsPair[] = capturedRows.map((r) => ({ predicted: Number(r.predicted_points), actual: Number(r.actual_points) }));
  const overallMae = mae(capturedPairs);
  const buckets = errorBuckets(capturedPairs);

  const { data: gameweekRows } = latestVersionId
    ? await supabase.from("projections").select("gameweek").eq("horizon", 1).eq("algorithm_version_id", latestVersionId)
    : { data: [] };
  // Sorted, and the minimum taken deliberately: that is the real CURRENT
  // gameweek. Until 2026-09-14 the engine wrote exactly one gameweek so an
  // unsorted [0] was always right; it now also writes the next two (see
  // compute_player_projections.py's PLAYER_LOOKAHEAD_GAMEWEEKS), and an
  // unsorted [0] would be whichever row Postgres returned first - this page
  // could silently show next week's numbers as if they were this week's.
  const gameweeks = Array.from(new Set((gameweekRows ?? []).map((r) => r.gameweek))).sort((a, b) => a - b);
  const currentGameweek = gameweeks[0] ?? null;

  // ---------------------------------------------------------------------
  // One shared base query for this gameweek's horizon=1 projections -
  // reused across every showcase below instead of re-querying per tile.
  // Range-paginated (unlike dreamteam-projections' own homepage, which
  // never needed to): ~3570 real EFL players is well past PostgREST's
  // 1000-row cap, and buildBestSquad below needs the REAL full pool, not
  // just the first page, to pick a genuinely correct squad per position.
  // ---------------------------------------------------------------------
  type PlayerJoin = { full_name: string; position: string; ownership_pct: number | null; teams: { id: number; name: string; competition: string; abbreviation: string; background_color: string; text_color: string } | null };
  type ProjectionRow = { total_points: number; rating: number | null; per_layer: unknown; player_id: number; players: PlayerJoin };
  const baseRows =
    latestVersionId && currentGameweek !== null
      ? await fetchAllRows<ProjectionRow>((from, to) =>
          supabase
            .from("projections")
            .select("total_points, rating, per_layer, player_id, players!inner(full_name, position, ownership_pct, teams!team_id(id, name, competition, abbreviation, background_color, text_color))")
            .eq("horizon", 1)
            .eq("gameweek", currentGameweek)
            .eq("algorithm_version_id", latestVersionId)
            .order("total_points", { ascending: false })
            .order("player_id")
            .range(from, to) as unknown as PromiseLike<{ data: ProjectionRow[] | null; error: { message: string } | null }>
        )
      : [];

  const seasonRows = await fetchAllRows<{ player_id: number; total_points: number }>((from, to) =>
    supabase.from("player_stats").select("player_id, total_points").is("gameweek", null).range(from, to)
  );
  const currentPointsByPlayer = new Map(seasonRows.map((r) => [r.player_id, Number(r.total_points) || 0]));

  const ratingsPlayers = baseRows.map((r) => {
    const player = r.players as unknown as PlayerJoin;
    const perLayer = r.per_layer as unknown as { fixture_quantity?: { fixtures?: FixtureEntry[] } };
    const team: TeamRef = {
      id: player.teams?.id ?? 0,
      name: player.teams?.name ?? "—",
      abbreviation: player.teams?.abbreviation ?? null,
      backgroundColor: player.teams?.background_color ?? null,
      textColor: player.teams?.text_color ?? null,
    };
    return {
      playerId: r.player_id,
      name: player.full_name,
      position: player.position,
      team,
      competition: player.teams?.competition ?? "—",
      ownershipPct: player.ownership_pct === null ? null : Number(player.ownership_pct),
      seasonPoints: currentPointsByPlayer.get(r.player_id) ?? 0,
      totalPoints: Number(r.total_points),
      rating: r.rating === null ? null : Number(r.rating),
      fixtures: perLayer.fixture_quantity?.fixtures ?? [],
    };
  });

  // ---------------------------------------------------------------------
  // HM Best Squad preview - the real buildBestSquad engine, same helper
  // best-squad/page.tsx itself calls, run once here against this
  // gameweek's full real pool.
  // ---------------------------------------------------------------------
  const squadPool: SquadCandidate[] = ratingsPlayers
    .filter((p) => ["GK", "DEF", "MID", "FWD"].includes(p.position))
    .map((p) => ({
      playerId: p.playerId,
      name: p.name,
      position: p.position as SquadCandidate["position"],
      teamId: p.team.id,
      teamName: p.team.name,
      teamAbbreviation: p.team.abbreviation,
      teamBackgroundColor: p.team.backgroundColor,
      teamTextColor: p.team.textColor,
      points: p.totalPoints,
      rating: p.rating,
      ownershipPct: p.ownershipPct,
    }));
  const { byFormation, bestFormation } = buildBestSquad(squadPool);
  const bestSquad = byFormation[bestFormation];

  const topFive: TopFiveEntry[] = ratingsPlayers.slice(0, 5).map((p) => ({
    playerId: p.playerId,
    name: p.name,
    position: p.position,
    team: p.team,
    competitionLabel: COMPETITION_LABELS[p.competition] ?? p.competition,
    totalPoints: p.totalPoints,
  }));

  // "Differential" - the highest-projected real player owned by under
  // DIFFERENTIAL_OWNERSHIP_CEILING% of managers, excluding this gameweek's
  // own #1 overall projected player so the card surfaces a genuinely
  // distinct real signal. Falls back to the single lowest-owned player
  // with a real ownership figure at all if nobody this week clears the bar.
  const differentialCandidates = ratingsPlayers.filter((p) => p.playerId !== ratingsPlayers[0]?.playerId);
  const lowOwnedPool = differentialCandidates.filter((p) => p.ownershipPct !== null && p.ownershipPct < DIFFERENTIAL_OWNERSHIP_CEILING);
  const differential =
    lowOwnedPool.length > 0
      ? [...lowOwnedPool].sort((a, b) => b.totalPoints - a.totalPoints)[0]
      : ([...differentialCandidates].filter((p) => p.ownershipPct !== null).sort((a, b) => (a.ownershipPct ?? 0) - (b.ownershipPct ?? 0))[0] ?? null);

  // ---------------------------------------------------------------------
  // Club picks - genuinely new vs. dreamteam-projections (no equivalent
  // there): real club_projections rows for this gameweek, reused for both
  // the "Top Club Pick" showcase card and the "Fixture to Target" signal
  // (the strongest single real win-probability found across every club's
  // own per_stat.fixtures entry for this gameweek - same real data
  // fixtures/page.tsx's own buildSide() already reads).
  // ---------------------------------------------------------------------
  const { data: latestClubVersionRow } = await supabase.from("club_projections").select("algorithm_version_id").order("algorithm_version_id", { ascending: false }).limit(1).maybeSingle();
  const latestClubVersionId = latestClubVersionRow?.algorithm_version_id;

  const { data: clubRowsRaw } =
    latestClubVersionId && currentGameweek !== null
      ? await supabase
          .from("club_projections")
          .select("total_points, team_id, per_stat, teams!inner(id, name, abbreviation, background_color, text_color)")
          .eq("horizon", 1)
          .eq("gameweek", currentGameweek)
          .eq("algorithm_version_id", latestClubVersionId)
          .order("total_points", { ascending: false })
      : { data: [] };
  const clubRows = (clubRowsRaw ?? []) as unknown as ClubProjRow[];
  const teamById = new Map(clubRows.map((r) => [r.teams.id, r.teams]));

  const topClubPick = clubRows[0] ? { team: toTeamRef(clubRows[0].teams), totalPoints: Number(clubRows[0].total_points) } : null;

  let fixtureTarget: { team: TeamRef; opponent: string; opponentAbbreviation: string | null; isHome: boolean; winProb: number | null; xg: number | null } | null = null;
  let bestWinProb = -1;
  for (const row of clubRows) {
    const perStat = row.per_stat as { fixtures?: ClubFixtureEntry[] };
    for (const f of perStat.fixtures ?? []) {
      if (f.gameweek !== currentGameweek || f.win_prob === null || f.win_prob === undefined) continue;
      if (f.win_prob > bestWinProb) {
        bestWinProb = f.win_prob;
        const opponent = teamById.get(f.opponent_team_id);
        fixtureTarget = {
          team: toTeamRef(row.teams),
          opponent: opponent?.name ?? "—",
          opponentAbbreviation: opponent?.abbreviation ?? null,
          isHome: f.is_home,
          winProb: f.win_prob,
          xg: f.expected_goals_for ?? null,
        };
      }
    }
  }

  // ---------------------------------------------------------------------
  // Player Face-Off preview - a REAL completed comparison (this
  // gameweek's #1 and #2 projected players), not the tool's own empty
  // picker screen.
  // ---------------------------------------------------------------------
  const [compareA, compareB] =
    ratingsPlayers.length >= 2 ? await Promise.all([loadComparePlayer(supabase, ratingsPlayers[0].playerId), loadComparePlayer(supabase, ratingsPlayers[1].playerId)]) : [null, null];

  // ---------------------------------------------------------------------
  // Fixture Forecast preview - real Championship fixtures for this
  // gameweek (the flagship division), scoped to 2 for the showcase, using
  // the same real club_projections.per_stat.fixtures probabilities
  // fixtures/page.tsx's own buildSide() reads.
  // ---------------------------------------------------------------------
  type FixtureTeamJoin = { id: number; name: string; abbreviation: string; background_color: string; text_color: string };
  const { data: fixtureRowsRaw } =
    currentGameweek !== null
      ? await supabase
          .from("fixtures")
          .select("id, kickoff_at, home_team_id, away_team_id, teams_home:home_team_id(id, name, abbreviation, background_color, text_color), teams_away:away_team_id(id, name, abbreviation, background_color, text_color)")
          .eq("competition", "championship")
          .eq("gameweek", currentGameweek)
          .order("kickoff_at")
          .limit(2)
      : { data: [] };

  function findClubFixture(teamId: number, opponentId: number, isHome: boolean): ClubFixtureEntry | undefined {
    const row = clubRows.find((r) => r.teams.id === teamId);
    const entries = (row?.per_stat as { fixtures?: ClubFixtureEntry[] } | undefined)?.fixtures ?? [];
    return entries.find((e) => e.gameweek === currentGameweek && e.opponent_team_id === opponentId && e.is_home === isHome);
  }
  function buildSide(team: FixtureTeamJoin, opponentId: number, isHome: boolean): FixtureSide {
    const match = findClubFixture(team.id, opponentId, isHome);
    return {
      team: { id: team.id, name: team.name, abbreviation: team.abbreviation, backgroundColor: team.background_color, textColor: team.text_color },
      winProb: match?.win_prob ?? null,
      cleanSheetProb: match?.clean_sheet_prob ?? null,
      twoPlusGoalsProb: match?.two_plus_goals_prob ?? null,
      expectedGoals: match?.expected_goals_for ?? null,
    };
  }

  const projectedByTeam = new Map<number, ProjectedPlayer[]>();
  for (const p of ratingsPlayers) {
    const list = projectedByTeam.get(p.team.id) ?? [];
    if (list.length < 3) {
      list.push({ playerId: p.playerId, name: p.name, totalPoints: p.totalPoints });
      projectedByTeam.set(p.team.id, list);
    }
  }

  const showcaseFixtures = (fixtureRowsRaw ?? []).map((f) => {
    const home = f.teams_home as unknown as FixtureTeamJoin;
    const away = f.teams_away as unknown as FixtureTeamJoin;
    return {
      id: f.id,
      kickoffAt: f.kickoff_at,
      home: buildSide(home, away.id, true),
      away: buildSide(away, home.id, false),
      drawProb: findClubFixture(home.id, away.id, true)?.draw_prob ?? null,
      homeProjected: projectedByTeam.get(home.id) ?? [],
      awayProjected: projectedByTeam.get(away.id) ?? [],
    };
  });

  const previewSlice = ratingsPlayers.slice(0, 10).map((p) => ({
    playerId: p.playerId,
    name: p.name,
    position: p.position,
    team: p.team,
    competition: p.competition,
    ownershipPct: p.ownershipPct,
    seasonPoints: p.seasonPoints,
    totalPoints: p.totalPoints,
    rating: p.rating,
    fixtures: p.fixtures,
  }));

  return (
    <main className="min-w-0 flex-1">
      {/* ================= HERO ================= */}
      <section className="relative isolate overflow-hidden border-b border-navy-800">
        <div className="absolute inset-0 -z-10">
          <Image src="/hail-mary-header.png" alt="" fill priority sizes="100vw" className="object-cover object-[70%_center] opacity-[0.4] sm:opacity-[0.44]" />
          <div className="absolute inset-0 bg-gradient-to-r from-navy-950 via-navy-950/92 to-navy-950/45" />
          <div className="absolute inset-0 bg-gradient-to-t from-navy-950 via-transparent to-navy-950/70" />
          <div className="bg-dot-grid absolute inset-0 opacity-[0.12]" />
        </div>
        <div className="pointer-events-none absolute top-[-15%] left-[8%] -z-10 h-[380px] w-[380px] rounded-full bg-sky-500/10 blur-[130px]" />
        <div className="pointer-events-none absolute right-[-8%] bottom-[-15%] -z-10 h-[340px] w-[340px] rounded-full bg-orange-500/[0.08] blur-[120px]" />

        <div className="relative mx-auto grid max-w-6xl grid-cols-1 gap-12 px-6 py-14 sm:px-10 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-8">
          {/* ---- copy ---- */}
          <div>
            {currentGameweek !== null && (
              <div className="flex items-center gap-2">
                <LivePulseDot />
                <span className="font-mono text-[11px] font-bold tracking-[0.14em] text-emerald-400 uppercase">Live · Gameweek {currentGameweek}</span>
              </div>
            )}
            <p className="mt-4 font-[family-name:var(--font-cond)] text-xs font-bold tracking-[0.32em] text-sky-400 uppercase">Fantasy EFL × Hail Mary</p>
            <h1 className="mt-2 font-[family-name:var(--font-cond)] text-[2.75rem] leading-[0.98] font-extrabold text-navy-50 sm:text-6xl lg:text-[4.25rem]">
              FREE TO PICK.
              <br />
              BUILT TO WIN.
            </h1>
            <p className="mt-5 max-w-md text-base text-navy-300">
              Real projected points for every Fantasy EFL player across the Championship, League One and League Two - plus a projection engine for the
              2 club picks the game also scores. No budget. No prices. Just the numbers.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <ToolCTA href="/projected-points" label="Explore Projections" />
              <SecondaryCTA href="/best-squad" label="Build Best Squad" />
            </div>
          </div>

          {/* ---- floating live-data composition ---- */}
          <div className="relative hidden h-[300px] sm:block sm:h-[340px] lg:h-[380px]">
            <svg aria-hidden viewBox="0 0 200 200" className="absolute top-1/2 right-[6%] h-[220px] w-[220px] -translate-y-1/2 text-navy-700/40 opacity-60">
              <circle cx="100" cy="100" r="94" fill="none" stroke="currentColor" strokeWidth="0.75" />
              <circle cx="100" cy="100" r="62" fill="none" stroke="currentColor" strokeWidth="0.75" />
              <circle cx="100" cy="100" r="30" fill="none" stroke="currentColor" strokeWidth="0.75" />
              <path d="M100 6 V194 M6 100 H194" stroke="currentColor" strokeWidth="0.5" />
            </svg>

            {ratingsPlayers[0] && (
              <HeroFloatCard
                href={`/players/${ratingsPlayers[0].playerId}`}
                team={ratingsPlayers[0].team}
                eyebrow="🔥 Top Projected"
                title={ratingsPlayers[0].name}
                sub={`${ratingsPlayers[0].team.name} · ${ratingsPlayers[0].position}`}
                value={ratingsPlayers[0].totalPoints.toFixed(1)}
                valueLabel="Projected pts"
                accent="#fb923c"
                className="top-0 right-[4%] w-[220px] rotate-2 sm:w-[240px]"
                delayMs={0}
              />
            )}
            {ratingsPlayers[1] && (
              <HeroFloatCard
                href={`/players/${ratingsPlayers[1].playerId}`}
                team={ratingsPlayers[1].team}
                eyebrow="⭐ Also Rated"
                title={ratingsPlayers[1].name}
                sub={`${ratingsPlayers[1].team.name} · ${ratingsPlayers[1].position}`}
                value={ratingsPlayers[1].totalPoints.toFixed(1)}
                valueLabel="Projected pts"
                accent="#38bdf8"
                className="top-[42%] left-0 w-[200px] -rotate-2 sm:w-[220px]"
                delayMs={120}
              />
            )}
            {topClubPick && (
              <HeroFloatCard
                href="/best-squad"
                team={topClubPick.team}
                eyebrow="🛡️ Top Club Pick"
                title={topClubPick.team.name}
                sub="2 club picks per squad"
                value={topClubPick.totalPoints.toFixed(1)}
                valueLabel="Projected pts"
                accent="#34d399"
                className="right-[10%] bottom-0 w-[210px] rotate-1 sm:w-[230px]"
                delayMs={240}
              />
            )}
          </div>
        </div>
      </section>

      {/* ================= CREDIBILITY TICKER ================= */}
      <section className="border-b border-navy-800 bg-navy-950 px-6 py-4 sm:px-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-3 sm:gap-x-6">
          <TickerStat first label="Players tracked" value={activePlayers !== null ? String(activePlayers) : "—"} />
          <TickerStat label="Clubs tracked" value={teamCount !== null ? String(teamCount) : "—"} />
          <TickerStat label="Predictions frozen" value={predictionsFrozen !== null ? predictionsFrozen.toLocaleString() : "—"} />
          <TickerStat label="Mean absolute error" value={overallMae !== null ? overallMae.toFixed(2) : "—"} />
          <TickerStat label="Within ±3 points" value={buckets ? `${buckets.within3.toFixed(0)}%` : "—"} />
        </div>
      </section>

      {/* ================= WHAT THE MODEL LIKES RIGHT NOW ================= */}
      {currentGameweek !== null && (
        <section className="relative overflow-hidden border-b border-navy-800 bg-navy-950/40 px-6 py-10 sm:px-10 sm:py-12">
          <div className="bg-dot-grid pointer-events-none absolute inset-0 opacity-[0.06]" />
          <Reveal className="relative mx-auto max-w-6xl">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <LivePulseDot />
                <SectionTag>Hail Mary · Gameweek {currentGameweek}</SectionTag>
              </div>
              <span className="font-mono text-[11px] text-navy-500">Refreshed every pipeline run</span>
            </div>
            <h2 className="mt-1.5 font-[family-name:var(--font-cond)] text-2xl font-extrabold text-navy-100 uppercase sm:text-[28px]">What the model likes right now</h2>

            <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
              {ratingsPlayers[0] && <FeaturedPickCard player={ratingsPlayers[0]} />}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-1">
                {topClubPick && (
                  <IntelCard href="/best-squad" emoji="🛡️" label="Top Club Pick" team={topClubPick.team} name={topClubPick.team.name} meta="2 club picks per squad" value={topClubPick.totalPoints.toFixed(1)} valueLabel="Projected pts" accent="#34d399" />
                )}
                {differential && (
                  <IntelCard
                    href="/projected-points"
                    emoji="👀"
                    label="Differential"
                    team={differential.team}
                    name={differential.name}
                    meta={differential.ownershipPct !== null ? `${differential.ownershipPct.toFixed(1)}% owned` : "Ownership unknown"}
                    value={differential.totalPoints.toFixed(1)}
                    valueLabel="Projected pts"
                    accent="#a78bfa"
                  />
                )}
                {fixtureTarget && (
                  <IntelCard
                    href="/fixtures"
                    emoji="🏟️"
                    label="Fixture to Target"
                    team={fixtureTarget.team}
                    name={fixtureTarget.team.name}
                    meta={`${fixtureTarget.isHome ? "vs" : "@"} ${fixtureTarget.opponentAbbreviation ?? fixtureTarget.opponent}${fixtureTarget.xg !== null ? ` · ${fixtureTarget.xg.toFixed(1)} proj goals` : ""}`}
                    value={fixtureTarget.winProb !== null ? `${Math.round(fixtureTarget.winProb * 100)}%` : "—"}
                    valueLabel="Win probability"
                    accent="#fb7185"
                  />
                )}
              </div>
            </div>
          </Reveal>
        </section>
      )}

      {/* ================= TOOL SHOWCASE ================= */}
      <section className="relative px-6 py-14 sm:px-10 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <SectionTag>Explore Hail Mary</SectionTag>
            <h2 className="mt-2 font-[family-name:var(--font-cond)] text-3xl font-extrabold text-navy-100 uppercase sm:text-4xl">Everything you need to attack the gameweek</h2>
          </div>

          {/* ---- 1. Hail Mary Projections ---- */}
          <Reveal className="relative mt-16 grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-12">
            <GhostNumber text={ratingsPlayers[0] ? ratingsPlayers[0].totalPoints.toFixed(1) : "01"} className="top-[-2.2rem] left-[-1rem] text-[8rem] opacity-40 sm:text-[11rem]" />
            <div className="relative">
              <SectionTag>Hail Mary Projections</SectionTag>
              <h3 className="mt-2 font-[family-name:var(--font-cond)] text-3xl font-extrabold text-navy-100">Every player. Every Gameweek. Every horizon.</h3>
              <p className="mt-3 max-w-md text-sm text-navy-300">
                This GW, next GW, or a 2/3/5-Gameweek outlook — every player across all 3 divisions priced with a projected points total and a 1–10
                rating, sortable any way you like.
              </p>
              <ToolCTA href="/projected-points" label="Explore Projections" />
            </div>
            <div className="relative">
              {previewSlice.length > 0 ? (
                <BrowserFrame url="efl.hailmaryfantasysports.co.uk/projected-points" accent="#38bdf8" fade maxHeight="560px">
                  <div className="p-4 sm:p-5">
                    <ProjectionsTable players={previewSlice} />
                  </div>
                </BrowserFrame>
              ) : (
                <EmptyPreview label="Projections land here the moment this gameweek's numbers are frozen." />
              )}
              <div className="-mt-px">
                <OpenToolBar href="/projected-points" label={`See all ${activePlayers ?? ""} players →`} />
              </div>
            </div>
          </Reveal>

          {/* ---- 2. Fixture Forecast ---- */}
          <Reveal className="relative mt-20 grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-12">
            <GhostNumber
              text={fixtureTarget?.winProb !== null && fixtureTarget?.winProb !== undefined ? `${Math.round(fixtureTarget.winProb * 100)}%` : "02"}
              className="top-[-2.2rem] right-[-1rem] text-[8rem] opacity-40 sm:text-[11rem] lg:left-[-1rem]"
            />
            <div className="relative order-2 lg:order-1">
              {showcaseFixtures.length > 0 ? (
                <BrowserFrame url="efl.hailmaryfantasysports.co.uk/fixtures" accent="#fb7185">
                  <div className="flex flex-col gap-3 p-4 sm:p-5">
                    {showcaseFixtures.map((f) => (
                      <FixtureCard key={f.id} kickoffAt={f.kickoffAt} home={f.home} away={f.away} drawProb={f.drawProb} homeProjected={f.homeProjected} awayProjected={f.awayProjected} />
                    ))}
                  </div>
                </BrowserFrame>
              ) : (
                <EmptyPreview label="Fixture forecasts land here once this gameweek's real fixtures are scraped." />
              )}
              <div className="-mt-px">
                <OpenToolBar href="/fixtures" label={`View full Gameweek ${currentGameweek ?? ""} slate →`} />
              </div>
            </div>
            <div className="relative order-1 lg:order-2">
              <SectionTag>Fixture Forecast</SectionTag>
              <h3 className="mt-2 font-[family-name:var(--font-cond)] text-3xl font-extrabold text-navy-100">Know the Gameweek before you pick.</h3>
              <p className="mt-3 max-w-md text-sm text-navy-300">
                Real win/draw/loss odds, projected goals, and clean-sheet chances for every Championship, League One and League Two fixture — the same
                real signals priced straight into every projection on this site.
              </p>
              <ToolCTA href="/fixtures" label="View Fixture Forecast" />
            </div>
          </Reveal>

          {/* ---- 3. HM Best Squad ---- */}
          <Reveal className="relative mt-20 overflow-hidden rounded-3xl">
            <div className="bg-tactical-lines pointer-events-none absolute inset-0 opacity-[0.35]" />
            <div className="pointer-events-none absolute top-1/2 left-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/[0.06] blur-[100px]" />
            <div className="relative grid grid-cols-1 items-center gap-8 p-1 lg:grid-cols-2 lg:gap-12 lg:p-6">
              <GhostNumber text={bestSquad.players.length > 0 ? bestSquad.totalPoints.toFixed(0) : "03"} className="top-[-1.6rem] left-[-1rem] text-[8rem] opacity-40 sm:text-[11rem]" />
              <div className="relative">
                <SectionTag>HM Best Squad</SectionTag>
                <h3 className="mt-2 font-[family-name:var(--font-cond)] text-3xl font-extrabold text-navy-100">No budget. No transfers. Just the strongest 7.</h3>
                <p className="mt-3 max-w-md text-sm text-navy-300">
                  Real Fantasy EFL rules: 7 players in one of 3 fixed formations (max 2 per club), plus your best 2 real club picks — rebuildable from
                  scratch every gameweek, free.
                </p>
                <ToolCTA href="/best-squad" label="Build Best Squad" />
              </div>
              {bestSquad.players.length > 0 ? (
                <Link href="/best-squad" className="group relative block transition-transform duration-300 hover:-translate-y-1.5">
                  <BrowserFrame url="efl.hailmaryfantasysports.co.uk/best-squad" accent="#a78bfa">
                    <div className="p-3 sm:p-4">
                      <div className="mb-3 flex flex-wrap gap-3 px-1">
                        <MiniStat label="Projected total" value={`${bestSquad.totalPoints.toFixed(1)} pts`} />
                        <MiniStat label="Formation" value={bestFormation} />
                      </div>
                      <PitchSquad players={bestSquad.players} />
                    </div>
                  </BrowserFrame>
                </Link>
              ) : (
                <EmptyPreview label="Your Best Squad appears here once this gameweek's projections are live." />
              )}
            </div>
          </Reveal>

          {/* ---- 4. HM Top Picks + Player Face-Off ---- */}
          <Reveal className="relative mt-20 overflow-hidden rounded-3xl">
            <div className="pointer-events-none absolute top-0 left-1/4 h-72 w-72 rounded-full bg-amber-500/[0.06] blur-[100px]" />
            <div className="pointer-events-none absolute right-1/4 bottom-0 h-72 w-72 rounded-full bg-rose-500/[0.06] blur-[100px]" />
            <div className="relative p-1 lg:p-6">
              <GhostNumber text="04" className="top-[-1.4rem] left-1/2 -translate-x-1/2 text-[8rem] opacity-40 sm:text-[11rem]" />
              <div className="relative text-center">
                <SectionTag>Share-Ready</SectionTag>
                <h3 className="mt-2 font-[family-name:var(--font-cond)] text-3xl font-extrabold text-navy-100">Built to post, not just to browse.</h3>
              </div>
              <div className="relative mt-10 grid grid-cols-1 gap-10 lg:grid-cols-2">
                <div className="flex flex-col items-center text-center">
                  {topFive.length >= 5 ? (
                    // Fixed 420px wide (same real export-size constraint as
                    // Top5Builder.tsx) - wider than a real phone viewport.
                    // ScaleToFit shrinks the whole card to fit rather than
                    // requiring a sideways scroll; overflow-x-auto stays as
                    // a defensive no-JS fallback.
                    <div className="w-full max-w-full overflow-x-auto">
                      <ScaleToFit>
                        <Link href="/top-picks" className="group mx-auto block w-fit transition-transform duration-300 hover:-translate-y-1.5">
                          <div className="overflow-hidden rounded-[22px] shadow-[0_30px_70px_-25px_rgba(0,0,0,0.7)] transition-shadow duration-300 group-hover:shadow-[0_35px_90px_-20px_rgba(56,189,248,0.35)]">
                            <TopFiveCard data={{ gameweek: currentGameweek ?? 0, horizon: 1, title: "Top 5 Projected Players", players: topFive }} />
                          </div>
                        </Link>
                      </ScaleToFit>
                    </div>
                  ) : (
                    <EmptyPreview label="Your Top 5 card appears here once this gameweek's projections are live." />
                  )}
                  <p className="mt-5 max-w-xs text-sm font-semibold text-navy-100">HM Top Picks</p>
                  <p className="mt-1 max-w-xs text-xs text-navy-400">Any position, any division — build a real leaderboard and download it as a shareable image for Twitter/X.</p>
                  <ToolCTA href="/top-picks" label="Build a Top 5" />
                </div>
                <div className="flex flex-col items-center text-center">
                  {compareA && compareB ? (
                    <Link href={`/compare?a=${compareA.id}&b=${compareB.id}`} className="group block w-full max-w-xl transition-transform duration-300 hover:-translate-y-1.5">
                      <BrowserFrame url="efl.hailmaryfantasysports.co.uk/compare" accent="#fb7185" fade maxHeight="380px">
                        <div className="p-3 sm:p-4">
                          <CompareView playerA={compareA} playerB={compareB} />
                        </div>
                      </BrowserFrame>
                    </Link>
                  ) : (
                    <EmptyPreview label="Player Face-Off comparisons appear here once this gameweek's projections are live." />
                  )}
                  <p className="mt-5 max-w-xs text-sm font-semibold text-navy-100">Player Face-Off</p>
                  <p className="mt-1 max-w-xs text-xs text-navy-400">Pick any two players — real projections, form, fixtures and ownership, side by side.</p>
                  <ToolCTA href="/compare" label="Compare Players" />
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ================= METHODOLOGY / CREDIBILITY (compact) ================= */}
      <section className="relative overflow-hidden border-t border-navy-800 bg-navy-950/60 px-6 py-10 sm:px-10">
        <ChevronMark className="top-[-20%] right-[4%] h-64 w-64 opacity-40" />
        <Reveal className="relative mx-auto max-w-6xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-md">
              <SectionTag>How it&apos;s built</SectionTag>
              <h3 className="mt-1 font-[family-name:var(--font-cond)] text-xl font-extrabold text-navy-100 uppercase">Five real layers, never one black box</h3>
              <p className="mt-1.5 text-xs text-navy-400">
                Every projection is a weighted blend of five independently-tracked layers, frozen before kickoff and checked against what actually
                happened.
              </p>
            </div>
            <div className="grid grid-cols-5 gap-2 sm:gap-3">
              {LAYERS.map((layer, i) => (
                <div key={layer.name} className="rounded-lg border border-navy-800 bg-navy-900 px-2 py-2.5 text-center sm:px-3">
                  <p className="font-[family-name:var(--font-cond)] text-[10px] font-bold tracking-wide text-sky-400 uppercase">L{i + 1}</p>
                  <p className="mt-0.5 truncate font-[family-name:var(--font-cond)] text-[11px] font-bold text-navy-100 sm:text-xs">{layer.name}</p>
                </div>
              ))}
            </div>
          </div>
          {buckets && (
            <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-2 border-t border-navy-800 pt-5 font-mono text-xs text-navy-400">
              <span>
                <span className="font-bold text-navy-100">{buckets.within1.toFixed(0)}%</span> within ±1pt
              </span>
              <span>
                <span className="font-bold text-navy-100">{buckets.within2.toFixed(0)}%</span> within ±2pt
              </span>
              <span>
                <span className="font-bold text-navy-100">{buckets.within3.toFixed(0)}%</span> within ±3pt
              </span>
              <span>
                <span className="font-bold text-navy-100">{buckets.within5.toFixed(0)}%</span> within ±5pt
              </span>
              <span className="text-navy-600">n={buckets.n.toLocaleString()} real captured results</span>
            </div>
          )}
        </Reveal>
      </section>

      {/* ================= FINAL CTA ================= */}
      <section className="relative overflow-hidden border-t border-navy-800 px-6 py-16 text-center sm:px-10 sm:py-20">
        <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(80% 120% at 50% 0%, #38bdf81a 0%, transparent 60%)" }} />
        <ChevronMark className="bottom-[-15%] left-[6%] h-72 w-72 opacity-30" />
        <div className="bg-dot-grid pointer-events-none absolute inset-0 opacity-[0.08]" />
        <Reveal className="relative mx-auto max-w-2xl">
          <h2 className="font-[family-name:var(--font-cond)] text-3xl font-extrabold text-navy-100 uppercase sm:text-4xl">Ready for the next Gameweek?</h2>
          <p className="mt-3 text-base text-navy-300">Let Hail Mary do the numbers.</p>
          <div className="mt-6 flex justify-center">
            <ToolCTA href="/projected-points" label="Explore the Projections" />
          </div>
        </Reveal>
      </section>
    </main>
  );
}
