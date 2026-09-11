import { createServiceSupabaseClient } from "@/lib/supabaseServiceClient";
import ClubLayerWeightsEditor from "./ClubLayerWeightsEditor";

export default async function ClubLayerWeightsPage() {
  const supabase = createServiceSupabaseClient();
  const { data: rows } = await supabase.from("club_layer_weights").select("id, horizon, layer, weight");

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-navy-100">Club Layer Weights</h1>
      <p className="mt-1 text-sm text-navy-300">
        Same real four-layer blend as player projections, for the club-pick side - no position dimension here (a club has no
        equivalent of GK/DEF/MID/FWD). Renormalizes automatically over whichever layers are populated.
      </p>
      <div className="mt-6">
        <ClubLayerWeightsEditor rows={rows ?? []} />
      </div>
    </div>
  );
}
