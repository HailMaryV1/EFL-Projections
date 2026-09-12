import { type FixtureEntry, formatFixture, fdrColor } from "@/lib/fixtures";
import TeamBadge, { type TeamBadgeInfo } from "../../TeamBadge";

export type ComparePlayer = {
  id: number;
  name: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  team: TeamBadgeInfo & { name: string };
  ownershipPct: number | null;
  pointsByHorizon: Record<number, number | null>;
  fixtures: FixtureEntry[];
  seasonPointsSoFar: number;
  gamesPlayed: number;
  goals: number;
  assists: number;
  rating: number | null;
};

const COLOR_A = "#38bdf8";
const COLOR_B = "#fb7185";

function fmt1(n: number | null | undefined) {
  return n === null || n === undefined ? "—" : n.toFixed(1);
}

function MiniHeader({ player, color, align }: { player: ComparePlayer; color: string; align: "left" | "right" }) {
  return (
    <div className={`flex min-w-0 items-center gap-3 border-t-2 pt-3 ${align === "right" ? "flex-row-reverse text-right" : "text-left"}`} style={{ borderColor: color }}>
      <TeamBadge team={player.team} size="lg" />
      <div className="min-w-0">
        <div className="truncate font-[family-name:var(--font-cond)] text-2xl font-extrabold text-navy-50">{player.name}</div>
        <div className="truncate text-sm font-semibold text-navy-300">
          {player.team.name} · {player.position}
        </div>
      </div>
    </div>
  );
}

function CompareRow({ label, valueA, valueB, formatA, formatB, note }: { label: string; valueA: number; valueB: number; formatA: string; formatB: string; note?: string }) {
  const max = Math.max(valueA, valueB, 1e-6);
  const aWins = valueA > valueB;
  const bWins = valueB > valueA;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
      <div className="flex min-w-0 flex-col items-end gap-1.5">
        <span className={`font-mono text-xl font-extrabold tabular-nums sm:text-2xl ${aWins ? "text-sky-300" : "text-navy-300"}`}>{formatA}</span>
        <div className="h-2 w-full max-w-[140px] overflow-hidden rounded-full bg-navy-800">
          <div className="ml-auto h-full rounded-full" style={{ width: `${(valueA / max) * 100}%`, background: COLOR_A }} />
        </div>
      </div>
      <div className="w-24 min-w-0 px-1 text-center sm:w-32">
        <div className="text-sm font-bold uppercase tracking-wide text-navy-300">{label}</div>
        {note && <div className="text-[11px] text-navy-600">{note}</div>}
      </div>
      <div className="flex min-w-0 flex-col items-start gap-1.5">
        <span className={`font-mono text-xl font-extrabold tabular-nums sm:text-2xl ${bWins ? "text-rose-300" : "text-navy-300"}`}>{formatB}</span>
        <div className="h-2 w-full max-w-[140px] overflow-hidden rounded-full bg-navy-800">
          <div className="h-full rounded-full" style={{ width: `${(valueB / max) * 100}%`, background: COLOR_B }} />
        </div>
      </div>
    </div>
  );
}

function FixtureTicker({ player }: { player: ComparePlayer }) {
  return (
    <div className="grid grid-cols-5 gap-1 sm:gap-1.5">
      {player.fixtures.length === 0 && <span className="col-span-5 text-center text-xs text-navy-500">No real upcoming fixtures found yet.</span>}
      {player.fixtures.map((f) => {
        const color = fdrColor(f.opponent_fdr) ?? "#7e93ab";
        return (
          <div key={`${f.gameweek}-${f.opponent}`} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md bg-navy-800 px-1" title={formatFixture(f)}>
            <span className="text-[10px] font-bold uppercase tracking-wide text-navy-400">GW{f.gameweek}</span>
            <span className="truncate font-mono text-sm font-extrabold" style={{ color }}>
              {f.is_home ? "" : "@"}
              {f.opponent.slice(0, 4).toUpperCase()}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function CompareView({ playerA, playerB }: { playerA: ComparePlayer; playerB: ComparePlayer }) {
  const perGameA = playerA.gamesPlayed > 0 ? playerA.seasonPointsSoFar / playerA.gamesPlayed : 0;
  const perGameB = playerB.gamesPlayed > 0 ? playerB.seasonPointsSoFar / playerB.gamesPlayed : 0;

  return (
    <div className="flex flex-col gap-8 rounded-2xl border border-navy-800 bg-navy-900 p-6">
      <div>
        <div className="mb-4 grid grid-cols-2 items-center gap-4">
          <MiniHeader player={playerA} color={COLOR_A} align="left" />
          <MiniHeader player={playerB} color={COLOR_B} align="right" />
        </div>
        <p className="mb-5 text-center font-[family-name:var(--font-cond)] text-lg font-extrabold uppercase tracking-wide text-navy-200">2026/27 Season · Head-to-Head</p>
        <div className="flex flex-col gap-5">
          <CompareRow label="This GW" note="Points expected this gameweek" valueA={playerA.pointsByHorizon[1] ?? 0} valueB={playerB.pointsByHorizon[1] ?? 0} formatA={fmt1(playerA.pointsByHorizon[1])} formatB={fmt1(playerB.pointsByHorizon[1])} />
          <CompareRow label="Next 5 GWs" note="Total points over the next 5 gameweeks" valueA={playerA.pointsByHorizon[5] ?? 0} valueB={playerB.pointsByHorizon[5] ?? 0} formatA={fmt1(playerA.pointsByHorizon[5])} formatB={fmt1(playerB.pointsByHorizon[5])} />
          <CompareRow label="Season Points" note="Real total so far" valueA={playerA.seasonPointsSoFar} valueB={playerB.seasonPointsSoFar} formatA={fmt1(playerA.seasonPointsSoFar)} formatB={fmt1(playerB.seasonPointsSoFar)} />
          <CompareRow label="Points Per Game" note={`${playerA.gamesPlayed} vs ${playerB.gamesPlayed} real games played`} valueA={perGameA} valueB={perGameB} formatA={fmt1(perGameA)} formatB={fmt1(perGameB)} />
          <CompareRow label="Goals" note="Real season total" valueA={playerA.goals} valueB={playerB.goals} formatA={String(playerA.goals)} formatB={String(playerB.goals)} />
          <CompareRow label="Assists" note="Real season total" valueA={playerA.assists} valueB={playerB.assists} formatA={String(playerA.assists)} formatB={String(playerB.assists)} />
          <CompareRow
            label="Ownership"
            note="% of managers who own this player right now"
            valueA={playerA.ownershipPct ?? 0}
            valueB={playerB.ownershipPct ?? 0}
            formatA={playerA.ownershipPct === null ? "—" : `${playerA.ownershipPct.toFixed(1)}%`}
            formatB={playerB.ownershipPct === null ? "—" : `${playerB.ownershipPct.toFixed(1)}%`}
          />
        </div>
      </div>

      <section>
        <h2 className="mb-4 text-center font-[family-name:var(--font-cond)] text-lg font-extrabold uppercase tracking-wide text-navy-200">Upcoming Fixtures</h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <FixtureTicker player={playerA} />
          <FixtureTicker player={playerB} />
        </div>
      </section>
    </div>
  );
}
