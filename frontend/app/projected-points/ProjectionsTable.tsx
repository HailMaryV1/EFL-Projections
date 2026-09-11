"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { type FixtureEntry, formatFixture } from "@/lib/fixtures";
import TeamBadge, { type TeamBadgeInfo } from "../TeamBadge";

type Player = {
  playerId: number;
  name: string;
  position: string;
  team: TeamBadgeInfo & { name: string };
  competition: string;
  ownershipPct: number | null;
  seasonPoints: number;
  totalPoints: number;
  rating: number | null;
  fixtures: FixtureEntry[];
};

const POSITIONS = ["ALL", "GK", "DEF", "MID", "FWD"] as const;
const COMPETITIONS = [
  { value: "ALL", label: "All divisions" },
  { value: "championship", label: "Championship" },
  { value: "league_one", label: "League One" },
  { value: "league_two", label: "League Two" },
] as const;
const POS_COLOR: Record<string, string> = { GK: "var(--color-pos-gk)", DEF: "var(--color-pos-def)", MID: "var(--color-pos-mid)", FWD: "var(--color-pos-fwd)" };
type SortKey = "seasonPoints" | "totalPoints" | "rating" | "ownershipPct";
type SortDir = "asc" | "desc";

function sortValue(p: Player, key: SortKey): number {
  return (p[key] ?? -Infinity) as number;
}

function SortHeader({ label, active, dir, onClick, className }: { label: string; active: boolean; dir: SortDir; onClick: () => void; className?: string }) {
  return (
    <th className={`cursor-pointer py-0 pb-3 font-[family-name:var(--font-cond)] text-[12.5px] font-semibold tracking-wide text-navy-400 uppercase hover:text-navy-200 ${className ?? ""}`} onClick={onClick}>
      <span className={active ? "text-navy-100" : ""}>
        {label}
        {active && <span className="ml-1">{dir === "desc" ? "↓" : "↑"}</span>}
      </span>
    </th>
  );
}

export default function ProjectionsTable({ players }: { players: Player[] }) {
  const [position, setPosition] = useState<(typeof POSITIONS)[number]>("ALL");
  const [competition, setCompetition] = useState<(typeof COMPETITIONS)[number]["value"]>("ALL");
  const [nameQuery, setNameQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("totalPoints");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const filtered = useMemo(() => {
    const query = nameQuery.trim().toLowerCase();
    const list = players.filter((p) => {
      if (position !== "ALL" && p.position !== position) return false;
      if (competition !== "ALL" && p.competition !== competition) return false;
      if (query && !p.name.toLowerCase().includes(query)) return false;
      return true;
    });
    return list.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [players, position, competition, nameQuery, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const inputClass =
    "rounded-md border border-navy-700 bg-navy-950 px-3 py-1.5 text-sm text-navy-100 placeholder:text-navy-500 focus:outline-none focus:ring-2 focus:ring-sky-400/40";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-navy-800 bg-navy-900 p-3.5">
        <label className="flex flex-col gap-1 text-xs text-navy-400">
          Search player
          <input type="text" value={nameQuery} onChange={(e) => setNameQuery(e.target.value)} placeholder="e.g. Fitzwater" className={`w-48 ${inputClass}`} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-navy-400">
          Division
          <select value={competition} onChange={(e) => setCompetition(e.target.value as typeof competition)} className={inputClass}>
            {COMPETITIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {POSITIONS.map((p) => (
            <button
              key={p}
              onClick={() => setPosition(p)}
              className={`rounded-full px-4 py-1.5 font-[family-name:var(--font-cond)] text-sm font-bold uppercase tracking-wide ${
                p === position ? "bg-sky-500 text-navy-950" : "bg-navy-900 text-navy-400 hover:bg-navy-800"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <p className="text-xs text-navy-400">
          {filtered.length} of {players.length} players
        </p>
      </div>

      <div className="sm:hidden">
        <label className="mb-3 flex items-center gap-2 text-xs text-navy-400">
          Sort by
          <select
            value={sortKey}
            onChange={(e) => toggleSort(e.target.value as SortKey)}
            className="rounded-md border border-navy-700 bg-navy-950 px-2 py-1.5 text-sm text-navy-100 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
          >
            <option value="totalPoints">Projected</option>
            <option value="seasonPoints">Season</option>
            <option value="rating">Rating</option>
            <option value="ownershipPct">Ownership</option>
          </select>
          <button
            type="button"
            onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
            className="rounded-md border border-navy-700 bg-navy-950 px-2 py-1.5 text-sm text-navy-100"
            aria-label="Toggle sort direction"
          >
            {sortDir === "desc" ? "↓" : "↑"}
          </button>
        </label>
        <div className="flex flex-col gap-2">
          {filtered.map((p) => (
            <div key={p.playerId} className="rounded-xl p-3 pl-4 shadow-[inset_0_0_0_1px_var(--color-navy-800)] odd:bg-navy-900 even:bg-navy-850">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <TeamBadge team={p.team} size="sm" />
                  <div className="min-w-0 leading-tight">
                    <Link href={`/players/${p.playerId}`} className="block truncate font-[family-name:var(--font-cond)] text-base font-bold text-navy-100 uppercase hover:text-sky-300">
                      {p.name}
                    </Link>
                    <div className="flex items-center gap-1.5 text-[11px] text-navy-400">
                      <span className="rounded px-1 font-mono text-[9px] font-bold" style={{ background: POS_COLOR[p.position], color: "#031321" }}>
                        {p.position}
                      </span>
                      <span className="truncate">{p.team.name}</span>
                    </div>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-[family-name:var(--font-cond)] text-2xl font-bold text-navy-100">{p.totalPoints.toFixed(1)}</div>
                  <div className="text-[9px] tracking-wide text-navy-500 uppercase">Projected</div>
                </div>
              </div>
              <p className="mt-1.5 font-mono text-[11px] text-navy-400">{p.fixtures.length === 0 ? "—" : p.fixtures.map(formatFixture).join(" · ")}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-navy-800 pt-2">
                <CardStat label="Season" value={p.seasonPoints} />
                <CardStat label="Rating" value={p.rating !== null ? p.rating.toFixed(1) : "—"} />
                <CardStat label="Owned" value={p.ownershipPct !== null ? `${p.ownershipPct.toFixed(1)}%` : "—"} />
              </div>
            </div>
          ))}
          {filtered.length === 0 && <p className="py-8 text-center text-sm text-navy-400">No players match these filters.</p>}
        </div>
      </div>

      <div className="hidden overflow-x-auto rounded-xl sm:block">
        <table className="w-full min-w-[1000px] border-collapse text-sm">
          <thead>
            <tr className="text-left">
              <th className="py-0 pb-3 pr-4 font-[family-name:var(--font-cond)] text-[12.5px] font-semibold tracking-wide text-navy-400 uppercase">Player</th>
              <th className="py-0 pb-3 pr-4 font-[family-name:var(--font-cond)] text-[12.5px] font-semibold tracking-wide text-navy-400 uppercase">Fixtures</th>
              <SortHeader label="Owned" active={sortKey === "ownershipPct"} dir={sortDir} onClick={() => toggleSort("ownershipPct")} className="pr-4 text-right" />
              <SortHeader label="Season" active={sortKey === "seasonPoints"} dir={sortDir} onClick={() => toggleSort("seasonPoints")} className="pr-4 text-right" />
              <SortHeader label="Projected" active={sortKey === "totalPoints"} dir={sortDir} onClick={() => toggleSort("totalPoints")} className="pr-4 text-right" />
              <SortHeader label="Rating" active={sortKey === "rating"} dir={sortDir} onClick={() => toggleSort("rating")} className="text-right" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.playerId} className="shadow-[inset_0_0_0_1px_var(--color-navy-800)] odd:bg-navy-900 even:bg-navy-850">
                <td className="rounded-l-lg py-3 pr-4 pl-3">
                  <div className="flex items-center gap-2.5">
                    <TeamBadge team={p.team} size="sm" />
                    <div className="leading-tight">
                      <Link href={`/players/${p.playerId}`} className="font-[family-name:var(--font-cond)] text-base font-bold text-navy-100 uppercase hover:text-sky-300">
                        {p.name}
                      </Link>
                      <div className="flex items-center gap-1.5 text-[11.5px] text-navy-400">
                        <span className="rounded px-1 font-mono text-[9.5px] font-bold" style={{ background: POS_COLOR[p.position], color: "#031321" }}>
                          {p.position}
                        </span>
                        <span className="truncate">{p.team.name}</span>
                      </div>
                    </div>
                  </div>
                </td>
                <td className="pr-4 font-mono text-[11px] text-navy-400">{p.fixtures.length === 0 ? "—" : p.fixtures.map(formatFixture).join(" · ")}</td>
                <td className="pr-4 text-right font-mono tabular-nums text-navy-100">{p.ownershipPct !== null ? `${p.ownershipPct.toFixed(1)}%` : "—"}</td>
                <td className="pr-4 text-right font-mono tabular-nums text-navy-100">{p.seasonPoints}</td>
                <td className="pr-4 text-right">
                  <span className="font-[family-name:var(--font-cond)] text-2xl font-bold text-navy-100">{p.totalPoints.toFixed(1)}</span>
                </td>
                <td className="rounded-r-lg py-3 pr-3 text-right font-mono text-[15px] tabular-nums text-navy-100">{p.rating !== null ? p.rating.toFixed(1) : "—"}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-sm text-navy-400">
                  No players match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CardStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] tracking-wide text-navy-500 uppercase">{label}</span>
      <span className="font-mono text-sm tabular-nums text-navy-100">{value}</span>
    </div>
  );
}
