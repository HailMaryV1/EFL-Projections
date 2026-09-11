import { createServiceSupabaseClient } from "@/lib/supabaseServiceClient";
import LayerWeightsEditor from "./LayerWeightsEditor";

export default async function LayerWeightsPage() {
  const supabase = createServiceSupabaseClient();
  const { data: rows } = await supabase.from("layer_weights").select("id, horizon, position, layer, weight");

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold text-navy-100">Layer Weights</h1>
      <p className="mt-1 text-sm text-navy-300">
        How much each of the four content layers counts toward a player&rsquo;s projection, per horizon and per position.
        Renormalizes automatically over whichever layers have real data for a given player - see docs/data-and-weights.md.
      </p>
      <div className="mt-6">
        <LayerWeightsEditor rows={rows ?? []} />
      </div>
    </div>
  );
}
