import Link from "next/link";
import TeamBadge, { type TeamBadgeInfo } from "../TeamBadge";

export type FixtureSide = {
  team: TeamBadgeInfo & { id: number; name: string };
  winProb: number | null;
  cleanSheetProb: number | null;
  twoPlusGoalsProb: number | null;
  expectedGoals: number | null;
};

export type ProjectedPlayer = { playerId: number; name: string; totalPoints: number };

export default function FixtureCard({
  kickoffAt,
  home,
  away,
  drawProb,
  homeProjected,
  awayProjected,
}: {
  kickoffAt: string;
  home: FixtureSide;
  away: FixtureSide;
  drawProb: number | null;
  homeProjected: ProjectedPlayer[];
  awayProjected: ProjectedPlayer[];
}) {
  const hasOdds = home.winProb !== null;
  return (
    <div className="rounded-xl border border-navy-800 bg-navy-900 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <TeamBadge team={home.team} size="sm" />
          <span className="truncate font-[family-name:var(--font-cond)] text-base font-bold uppercase text-navy-100">{home.team.name}</span>
        </div>
        <div className="shrink-0 px-2 text-center">
          <p className="font-mono text-sm text-navy-300">{new Date(kickoffAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })}</p>
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <span className="truncate font-[family-name:var(--font-cond)] text-base font-bold uppercase text-navy-100">{away.team.name}</span>
          <TeamBadge team={away.team} size="sm" />
        </div>
      </div>

      {hasOdds ? (
        <>
          <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-navy-800">
            <div style={{ width: `${(home.winProb ?? 0) * 100}%`, background: "#00ff87" }} />
            <div style={{ width: `${(drawProb ?? 0) * 100}%`, background: "#4b5b76" }} />
            <div style={{ width: `${(away.winProb ?? 0) * 100}%`, background: "#ff1751" }} />
          </div>
          <div className="mt-1 flex justify-between font-mono text-[11px] text-navy-400">
            <span style={{ color: "#00ff87" }}>{Math.round((home.winProb ?? 0) * 100)}%</span>
            <span>{Math.round((drawProb ?? 0) * 100)}% draw</span>
            <span style={{ color: "#ff1751" }}>{Math.round((away.winProb ?? 0) * 100)}%</span>
          </div>

          {home.expectedGoals !== null && away.expectedGoals !== null && (
            <p className="mt-3 text-center font-[family-name:var(--font-cond)] text-lg font-bold text-navy-100">
              {home.expectedGoals.toFixed(1)} <span className="text-xs font-normal text-navy-500 uppercase">projected goals</span> {away.expectedGoals.toFixed(1)}
            </p>
          )}

          <div className="mt-3 grid grid-cols-2 gap-4 text-center">
            <TeamRateStats side={home} />
            <TeamRateStats side={away} />
          </div>
        </>
      ) : (
        <p className="mt-3 text-center text-xs text-navy-500">Not enough real season data yet to project this fixture.</p>
      )}

      {(homeProjected.length > 0 || awayProjected.length > 0) && (
        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-navy-800 pt-3">
          <ProjectedList players={homeProjected} />
          <ProjectedList players={awayProjected} />
        </div>
      )}
    </div>
  );
}

function TeamRateStats({ side }: { side: FixtureSide }) {
  return (
    <div className="flex justify-center gap-4">
      <div>
        <p className="font-mono text-sm font-bold text-emerald-400">{side.cleanSheetProb !== null ? `${Math.round(side.cleanSheetProb * 100)}%` : "—"}</p>
        <p className="text-[9px] tracking-wide text-navy-500 uppercase">Clean sheet</p>
      </div>
      <div>
        <p className="font-mono text-sm font-bold text-sky-400">{side.twoPlusGoalsProb !== null ? `${Math.round(side.twoPlusGoalsProb * 100)}%` : "—"}</p>
        <p className="text-[9px] tracking-wide text-navy-500 uppercase">2+ goals</p>
      </div>
    </div>
  );
}

function ProjectedList({ players }: { players: ProjectedPlayer[] }) {
  return (
    <ul className="space-y-1 text-sm">
      {players.map((p) => (
        <li key={p.playerId} className="flex items-center justify-between gap-2">
          <Link href={`/players/${p.playerId}`} className="truncate text-navy-200 hover:text-sky-300">
            {p.name}
          </Link>
          <span className="shrink-0 font-mono tabular-nums text-navy-400">{p.totalPoints.toFixed(1)}</span>
        </li>
      ))}
      {players.length === 0 && <li className="text-navy-600">—</li>}
    </ul>
  );
}
