import { type SquadCandidate } from "@/lib/squadBuilder";
import TeamBadge from "../../TeamBadge";

const ROW_ORDER: SquadCandidate["position"][] = ["FWD", "MID", "DEF", "GK"];

export default function PitchSquad({ players }: { players: SquadCandidate[] }) {
  const rows = ROW_ORDER.map((pos) => ({ pos, players: players.filter((p) => p.position === pos) }));

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-emerald-900/60 shadow-2xl shadow-black/40"
      style={{ backgroundImage: "url(/pitch-bg.jpg)", backgroundSize: "cover", backgroundPosition: "center" }}
    >
      <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(120% 100% at 50% 15%, transparent 35%, rgba(0,0,0,0.45) 100%)" }} />
      <div className="relative flex flex-col gap-4 px-1 py-8 sm:gap-8 sm:px-3">
        {rows.map(({ pos, players: rowPlayers }) => (
          <div key={pos} className="flex justify-evenly gap-1 sm:gap-2">
            {rowPlayers.map((p) => (
              <div key={p.playerId} className="flex w-16 flex-col items-center gap-1 rounded-xl bg-navy-950/85 px-1 py-2 text-center shadow-lg shadow-black/50 ring-1 ring-white/10 backdrop-blur-sm sm:w-24 sm:px-2 sm:py-2.5">
                <TeamBadge team={{ abbreviation: p.teamAbbreviation, backgroundColor: p.teamBackgroundColor, textColor: p.teamTextColor }} size="sm" />
                <span className="w-full min-w-0 truncate font-[family-name:var(--font-cond)] text-[11px] font-bold uppercase text-white sm:text-sm" title={p.name}>
                  {p.name}
                </span>
                <span className="font-[family-name:var(--font-cond)] text-lg font-bold text-sky-300 sm:text-xl">{p.points.toFixed(1)}</span>
                <span className="text-[9px] text-white/50 sm:text-[10px]">{p.rating !== null ? p.rating.toFixed(1) : "—"}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
