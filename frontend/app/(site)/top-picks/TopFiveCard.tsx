import TeamBadge, { type TeamBadgeInfo } from "../../TeamBadge";

export type TopFiveEntry = {
  playerId: number;
  name: string;
  position: string;
  team: TeamBadgeInfo & { name: string };
  competitionLabel: string;
  totalPoints: number;
};
export type TopFiveCardData = { gameweek: number; horizon: number; title: string; players: TopFiveEntry[] };

const RANK_COLORS = ["#f59e0b", "#94a3b8", "#c2703d", "#38bdf8", "#38bdf8"];

// Same real card language as dreamteam-projections' own TopFiveCard - a
// ranked-list card, adapted for a game with no price (dropped the £Xm
// line, shown division instead).
export default function TopFiveCard({ data }: { data: TopFiveCardData }) {
  const { gameweek, horizon, title, players } = data;
  const gameweekLabel = horizon > 1 ? `GW${gameweek}–GW${gameweek + horizon - 1}` : `GW${gameweek}`;

  return (
    <div
      className="relative w-[420px] overflow-hidden rounded-[22px] border border-navy-800 p-[29px_24px_22px]"
      style={{
        background:
          "radial-gradient(130% 100% at 100% 0%, #38bdf830 0%, transparent 55%), radial-gradient(120% 90% at 0% 105%, #f59e0b26 0%, transparent 55%), linear-gradient(160deg, var(--color-navy-900), var(--color-navy-950) 70%)",
        boxShadow: "0 30px 70px -20px #000000b0, 0 0 0 1px #ffffff08 inset",
      }}
    >
      <div className="absolute top-0 right-0 left-0 h-[5px]" style={{ background: "linear-gradient(90deg, #7dd3fc, #0b1a3d)" }} />
      <div className="font-[family-name:var(--font-cond)] text-xs font-bold tracking-[0.14em] text-sky-300 uppercase">
        {gameweekLabel} · Projected Points{horizon > 1 ? ` · ${horizon} GWs Combined` : ""}
      </div>
      <div className="mt-1.5 mb-5 font-[family-name:var(--font-cond)] text-[32px] leading-[1.02] font-extrabold text-navy-100 uppercase">{title}</div>

      <div className="flex flex-col gap-2">
        {players.map((p, i) => {
          const rankColor = RANK_COLORS[i] ?? "#38bdf8";
          return (
            <div key={p.playerId} className="flex items-center gap-3 rounded-[12px] border border-navy-800 bg-navy-950/50 py-2.5 pr-3.5 pl-2.5" style={{ borderLeft: `3px solid ${rankColor}` }}>
              <div
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-[family-name:var(--font-cond)] text-[13px] font-extrabold"
                style={{ color: i === 0 ? "#031321" : "#fff", background: i === 0 ? rankColor : "transparent", border: i === 0 ? "none" : `1.5px solid ${rankColor}` }}
              >
                {i + 1}
              </div>
              <TeamBadge team={p.team} size="md" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-[family-name:var(--font-cond)] text-[15px] font-bold text-navy-100 uppercase">{p.name}</div>
                <div className="text-[10.5px] text-navy-500">
                  {p.team.name} · {p.position} · {p.competitionLabel}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-[family-name:var(--font-cond)] text-2xl leading-none font-extrabold text-navy-100">{p.totalPoints.toFixed(1)}</div>
                <div className="mt-0.5 text-[8px] tracking-[0.08em] text-navy-500 uppercase">{horizon > 1 ? `Pts · ${horizon}GW` : "Pts"}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex items-center border-t border-navy-800 pt-3">
        <div className="flex items-center gap-1.5 font-[family-name:var(--font-cond)] text-[11px] font-bold tracking-wide text-navy-300 uppercase">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" width={15} height={15} alt="" />
          Hail Mary
        </div>
      </div>
    </div>
  );
}
