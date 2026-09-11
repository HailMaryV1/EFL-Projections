"use client";

import { useState } from "react";
import { saveClubLayerWeights } from "./actions";

type Row = { id: number; horizon: number; layer: string; weight: number };

const LAYERS = ["form", "fixture_quantity", "fixture_quality", "live_odds"] as const;
const LAYER_LABELS: Record<string, string> = {
  form: "Form",
  fixture_quantity: "Fixture Quantity",
  fixture_quality: "Fixture Quality",
  live_odds: "Live Odds",
};
const HORIZONS = [1, 2, 3, 5] as const;

export default function ClubLayerWeightsEditor({ rows }: { rows: Row[] }) {
  const [weights, setWeights] = useState<Record<number, number>>(() => Object.fromEntries(rows.map((r) => [r.id, r.weight])));
  const byKey = new Map(rows.map((r) => [`${r.horizon}|${r.layer}`, r]));

  return (
    <form action={saveClubLayerWeights} className="space-y-6">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-navy-800 text-left text-xs uppercase tracking-wide text-navy-400">
            <th className="py-2 pr-4">Horizon</th>
            {LAYERS.map((layer) => (
              <th key={layer} className="py-2 pr-4">
                {LAYER_LABELS[layer]}
              </th>
            ))}
            <th className="py-2">Split (renormalized)</th>
          </tr>
        </thead>
        <tbody>
          {HORIZONS.map((horizon) => {
            const cellRows = LAYERS.map((layer) => byKey.get(`${horizon}|${layer}`)).filter(Boolean) as Row[];
            const total = cellRows.reduce((sum, r) => sum + (weights[r.id] ?? r.weight), 0);
            return (
              <tr key={horizon} className="border-b border-navy-800/60">
                <td className="py-2 pr-4 font-medium text-navy-100">
                  {horizon} GW{horizon > 1 ? "s" : ""}
                </td>
                {LAYERS.map((layer) => {
                  const row = byKey.get(`${horizon}|${layer}`);
                  if (!row) return <td key={layer} />;
                  return (
                    <td key={layer} className="py-2 pr-4">
                      <input
                        name={`weight_${row.id}`}
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        value={weights[row.id] ?? row.weight}
                        onChange={(e) => setWeights((w) => ({ ...w, [row.id]: Number(e.target.value) }))}
                        className="w-20 rounded-md border border-navy-700 bg-navy-950 px-2 py-1 tabular-nums text-navy-100 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
                      />
                    </td>
                  );
                })}
                <td className="py-2 text-xs tabular-nums text-navy-300">
                  {cellRows
                    .map((r) => `${LAYER_LABELS[r.layer].split(" ")[0]} ${total > 0 ? Math.round(((weights[r.id] ?? r.weight) / total) * 100) : 0}%`)
                    .join(" · ")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button type="submit" className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500">
        Save changes
      </button>
    </form>
  );
}
