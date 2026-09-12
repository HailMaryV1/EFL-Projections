"use server";

import { revalidatePath } from "next/cache";
import { createAuthServerClient } from "@/lib/supabaseServerClient";
import { createServiceSupabaseClient } from "@/lib/supabaseServiceClient";
import { logActivity } from "@/lib/adminHelpers";
import { isAdminEmail } from "@/lib/adminAccess";

const LAYERS = ["form", "fixture_quantity", "fixture_quality", "live_odds"] as const;
const POSITIONS = ["GK", "DEF", "MID", "FWD"] as const;
const HORIZONS = [1, 2, 3, 5] as const;

// Same real percentile schedule as dreamteam-projections' own version -
// a re-runnable measurement against THIS project's own live data, not a
// value frozen once in a code comment.
const PERCENTILE_SCHEDULE: [number, number][] = [
  [0, 1],
  [0.1, 2],
  [0.25, 4],
  [0.5, 5],
  [0.75, 7],
  [0.9, 9],
  [1, 10],
];
const MIN_SAMPLE_SIZE = 5; // below this, a percentile isn't a real measurement - leave unset rather than freeze noise.

function percentile(sorted: number[], p: number) {
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export async function recalibrateAnchors() {
  const authClient = await createAuthServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user || !isAdminEmail(user.email)) throw new Error("Not authorized.");

  const supabase = createServiceSupabaseClient();

  const { data: latest } = await supabase.from("projections").select("algorithm_version_id").order("algorithm_version_id", { ascending: false }).limit(1).maybeSingle();
  if (!latest) {
    return { ok: false as const, message: "No projections exist yet - run compute_player_projections.py first." };
  }

  const { data: rows } = await supabase
    .from("projections")
    .select("horizon, per_layer, players!inner(position)")
    .eq("algorithm_version_id", latest.algorithm_version_id);

  const samples = new Map<string, number[]>();
  for (const row of rows ?? []) {
    const position = (row.players as unknown as { position: string }).position;
    const perLayer = row.per_layer as Record<string, { value: number | null; populated: boolean }>;
    for (const layer of LAYERS) {
      const cell = perLayer[layer];
      if (!cell?.populated || cell.value === null) continue;
      const key = `${row.horizon}|${position}|${layer}`;
      if (!samples.has(key)) samples.set(key, []);
      samples.get(key)!.push(cell.value);
    }
  }

  let calibrated = 0;
  let skippedThinSample = 0;
  for (const horizon of HORIZONS) {
    for (const position of POSITIONS) {
      for (const layer of LAYERS) {
        const values = (samples.get(`${horizon}|${position}|${layer}`) ?? []).sort((a, b) => a - b);
        if (values.length < MIN_SAMPLE_SIZE) {
          skippedThinSample += 1;
          continue;
        }
        const anchors = PERCENTILE_SCHEDULE.map(([p, rating]) => [Math.round(percentile(values, p) * 1000) / 1000, rating]);
        await supabase.from("rating_anchors").upsert(
          { horizon, position, layer, anchors, updated_at: new Date().toISOString() },
          { onConflict: "horizon,position,layer" }
        );
        calibrated += 1;
      }
    }
  }

  await logActivity(supabase, "rating_anchors_recalibrated", `Recalibrated ${calibrated} anchor set(s) from live data, ${skippedThinSample} skipped (fewer than ${MIN_SAMPLE_SIZE} real samples)`, user.email ?? null, {
    algorithm_version_id: latest.algorithm_version_id,
  });

  revalidatePath("/admin/rating-anchors");
  revalidatePath("/admin");
  return { ok: true as const, message: `Calibrated ${calibrated} of ${HORIZONS.length * POSITIONS.length * LAYERS.length} anchor sets. ${skippedThinSample} skipped - fewer than ${MIN_SAMPLE_SIZE} real samples to measure from yet.` };
}
