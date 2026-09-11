"use client";

import { useState } from "react";
import { type BuiltSquad } from "@/lib/squadBuilder";
import PitchSquad from "./PitchSquad";

export default function SquadTabs({ byFormation, bestFormation }: { byFormation: Record<string, BuiltSquad>; bestFormation: string }) {
  const formations = Object.keys(byFormation);
  const [formation, setFormation] = useState(bestFormation);
  const squad = byFormation[formation];

  return (
    <div>
      <div className="flex flex-wrap gap-1">
        {formations.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFormation(f)}
            className={`rounded-full px-4 py-1.5 font-[family-name:var(--font-cond)] text-sm font-bold uppercase tracking-wide ${
              f === formation ? "bg-sky-500 text-navy-950" : "bg-navy-900 text-navy-400 hover:bg-navy-800"
            }`}
          >
            {f}
            {f === bestFormation && <span className="ml-1.5 text-[10px] normal-case text-emerald-300">best</span>}
          </button>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="Projected total" value={`${squad.totalPoints.toFixed(1)} pts`} />
        <Stat label="Formation" value={`GK-${formation.split("-").slice(1).join("-")}`} />
      </div>
      {squad.incomplete && <p className="mt-3 text-sm text-amber-400">Not enough real, positioned candidates existed to fill every slot under this formation.</p>}

      <div className="mt-4">
        <PitchSquad players={squad.players} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-navy-800 bg-navy-900 p-4">
      <p className="font-[family-name:var(--font-cond)] text-2xl font-bold text-navy-100">{value}</p>
      <p className="text-xs text-navy-400">{label}</p>
    </div>
  );
}
