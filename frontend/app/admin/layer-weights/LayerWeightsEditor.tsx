"use client";

import { useState } from "react";
import { saveLayerWeights } from "./actions";

type Row = { id: number; horizon: number; position: string; layer: string; weight: number };

const LAYERS = ["form", "fixture_quantity", "fixture_quality", "live_odds"] as const;
const LAYER_LABELS: Record<string, string> = {
  form: "Form",
  fixture_quantity: "Fixture Quantity",
  fixture_quality: "Fixture Quality",
  live_odds: "Live Odds",
};
const POSITIONS = ["GK", "DEF", "MID", "FWD"] as const;
const HORIZONS = [1, 2, 3, 5] as const;

export default function LayerWeightsEditor({ rows }: { rows: Row[] }) {
  const [weights, setWeights] = useState<Record<number, number>>(() => Object.fromEntries(rows.map((r) => [r.id, r.weight])));

  const byKey = new Map(rows.map((r) => [`${r.horizon}|${r.position}|${r.layer}`, r]));

  return (
    <form action={saveLayerWeights} className="space-y-10">
      {HORIZONS.map((horizon) => (
        <section key={horizon}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-navy-300">
            {horizon} gameweek{horizon > 1 ? "s" : ""} ahead
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-navy-800 text-left text-xs uppercase tracking-wide text-navy-400">
                  <th className="py-2 pr-4">Position</th>
                  {LAYERS.map((layer) => (
                    <th key={layer} className="py-2 pr-4">
                      {LAYER_LABELS[layer]}
                    </th>
                  ))}
                  <th className="py-2">Split (renormalized)</th>
                </tr>
              </thead>
              <tbody>
                {POSITIONS.map((position) => {
                  const cellRows = LAYERS.map((layer) => byKey.get(`${horizon}|${position}|${layer}`)).filter(Boolean) as Row[];
                  const total = cellRows.reduce((sum, r) => sum + (weights[r.id] ?? r.weight), 0);
                  return (
                    <tr key={position} className="border-b border-navy-800/60">
                      <td className="py-2 pr-4 font-medium text-navy-100">{position}</td>
                      {LAYERS.map((layer) => {
                        const row = byKey.get(`${horizon}|${position}|${layer}`);
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
          </div>
        </section>
      ))}
      <p className="text-xs text-navy-400">
        Xmins has no weight here - it gates every stat&rsquo;s expected count directly rather than blending with the other four. A layer
        with no real data for a given player is excluded and the rest renormalize automatically - the split shown above is what actually
        gets used, not the raw numbers you type.
      </p>
      <button type="submit" className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500">
        Save changes
      </button>
    </form>
  );
}
