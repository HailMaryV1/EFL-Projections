import { createServiceSupabaseClient } from "@/lib/supabaseServiceClient";
import RecalibrateButton from "./RecalibrateButton";

const LAYER_LABELS: Record<string, string> = {
  form: "Form",
  fixture_quantity: "Fixture Quantity",
  fixture_quality: "Fixture Quality",
  live_odds: "Live Odds",
};

export default async function RatingAnchorsPage() {
  const supabase = createServiceSupabaseClient();
  const { data: anchors } = await supabase.from("rating_anchors").select("horizon, position, layer, anchors, updated_at").order("horizon").order("position").order("layer");

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy-100">Rating Anchors</h1>
        <p className="mt-1 text-sm text-navy-300">
          What a &ldquo;7&rdquo; actually means for a given layer, position and horizon - real, measured control points (a
          piecewise-linear map from a raw value to 1-10), not raw sliders. This is reference only: the scale can never be
          dragged into quietly lying about what a rating means. Recalibrating replaces every anchor set with a fresh
          measurement of today&rsquo;s real projection data.
        </p>
      </div>

      <RecalibrateButton />

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-navy-300">Current anchors</h2>
        {(anchors ?? []).length === 0 ? (
          <p className="text-sm text-navy-400">
            No anchors calibrated yet - every layer&rsquo;s rating stays unscored until this has real data to measure from. This is
            expected on a fresh project, not a bug.
          </p>
        ) : (
          <div className="space-y-4">
            {(anchors ?? []).map((row) => (
              <div key={`${row.horizon}|${row.position}|${row.layer}`} className="rounded-lg border border-navy-800 bg-navy-900 p-3 text-sm">
                <p className="font-medium text-navy-100">
                  {LAYER_LABELS[row.layer]} · {row.position} · {row.horizon} gameweek{row.horizon > 1 ? "s" : ""}
                </p>
                <p className="mt-1 font-mono text-xs text-navy-300">
                  {(row.anchors as [number, number][]).map(([value, rating]) => `${value}→${rating}`).join("  ")}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
