"use client";

import { useMemo, useState } from "react";
import TopFiveCard, { type TopFiveEntry } from "./TopFiveCard";
import DownloadTopFiveButton from "./DownloadTopFiveButton";
import ScaleToFit from "../../ScaleToFit";

type Player = TopFiveEntry;

const POSITIONS = ["ALL", "GK", "DEF", "MID", "FWD"] as const;
const POSITION_PLURAL: Record<string, string> = { GK: "Goalkeepers", DEF: "Defenders", MID: "Midfielders", FWD: "Forwards" };
const COMPETITIONS = [
  { value: "ALL", label: "All divisions" },
  { value: "championship", label: "Championship" },
  { value: "league_one", label: "League One" },
  { value: "league_two", label: "League Two" },
] as const;

function buildTitle(position: (typeof POSITIONS)[number], competition: string): string {
  const posLabel = position === "ALL" ? "Projected Players" : POSITION_PLURAL[position];
  const compLabel = COMPETITIONS.find((c) => c.value === competition)?.label ?? "";
  return `Top 5 ${posLabel}${competition !== "ALL" ? ` — ${compLabel}` : ""}`;
}

export default function Top5Builder({ players, gameweek, horizon }: { players: (Player & { competition: string })[]; gameweek: number; horizon: number }) {
  const [position, setPosition] = useState<(typeof POSITIONS)[number]>("ALL");
  const [competition, setCompetition] = useState<(typeof COMPETITIONS)[number]["value"]>("ALL");

  const top5 = useMemo(() => {
    return players
      .filter((p) => (position === "ALL" || p.position === position) && (competition === "ALL" || p.competition === competition))
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .slice(0, 5);
  }, [players, position, competition]);

  const title = buildTitle(position, competition);

  return (
    <div className="flex min-w-0 flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-navy-800 bg-navy-900 p-3.5">
          <div className="flex flex-col gap-1 text-xs text-navy-400">
            Position
            <div className="flex flex-wrap gap-1">
              {POSITIONS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPosition(p)}
                  className={`rounded-full px-3.5 py-1.5 font-[family-name:var(--font-cond)] text-sm font-bold uppercase tracking-wide ${
                    p === position ? "bg-sky-500 text-navy-950" : "bg-navy-800 text-navy-400 hover:bg-navy-700"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1 text-xs text-navy-400">
            Division
            <select
              value={competition}
              onChange={(e) => setCompetition(e.target.value as typeof competition)}
              className="rounded-md border border-navy-700 bg-navy-950 px-3 py-1.5 text-sm text-navy-100 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
            >
              {COMPETITIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="text-sm text-navy-300">
          <span className="font-semibold text-navy-100">{title}</span> for Gameweek {gameweek}
          {top5.length < 5 && <span className="text-amber-400"> - only {top5.length} real player(s) match these filters.</span>}
        </p>

        <ul className="mt-3 divide-y divide-navy-800 text-sm">
          {top5.map((p, i) => (
            <li key={p.playerId} className="flex items-center justify-between gap-3 py-2">
              <span className="text-navy-200">
                {i + 1}. {p.name} <span className="text-navy-500">({p.team.name})</span>
              </span>
              <span className="shrink-0 font-mono tabular-nums text-navy-400">{p.totalPoints.toFixed(1)}pts</span>
            </li>
          ))}
        </ul>

        <div className="mt-5">
          <DownloadTopFiveButton data={{ gameweek, horizon, title, players: top5 }} />
        </div>
      </div>

      <div className="min-w-0 shrink-0 overflow-x-auto">
        {/* Real user report from a phone screenshot: this fixed-width
            card was cut off on mobile - overflow-x-auto technically made
            it scrollable, but nothing hinted at that, and the wrong half
            showed by default. ScaleToFit shrinks the preview to fit;
            overflow-x-auto stays as the pre-hydration fallback. */}
        <ScaleToFit>
          <TopFiveCard data={{ gameweek, horizon, title, players: top5 }} />
        </ScaleToFit>
      </div>
    </div>
  );
}
