import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Every settings save writes an activity_log row and bumps
 * algorithm_versions - so a past projection stays attributable to the
 * exact weights that produced it and every change has a real, visible
 * audit trail (not a silent overwrite). Same pattern as dreamteam-
 * projections' own lib/adminHelpers.ts, adapted for this project's own
 * real tables (scoring_rules/layer_weights + the club-side equivalents +
 * the two tiered tables - see docs/data-and-weights.md).
 */
export async function logActivity(
  supabase: SupabaseClient,
  eventType: string,
  summary: string,
  actor: string | null,
  details?: Record<string, unknown>
) {
  await supabase.from("activity_log").insert({ event_type: eventType, actor, summary, details: details ?? null });
}

export async function bumpAlgorithmVersion(supabase: SupabaseClient, actor: string | null, note: string) {
  const [
    { data: layerWeightRows },
    { data: scoringRuleRows },
    { data: clubLayerWeightRows },
    { data: clubScoringRuleRows },
    { data: appearanceTierRows },
    { data: hatTrickTierRows },
    { data: revisionRow },
  ] = await Promise.all([
    supabase.from("layer_weights").select("horizon, position, layer, weight"),
    supabase.from("scoring_rules").select("applies_to, stat, points"),
    supabase.from("club_layer_weights").select("horizon, layer, weight"),
    supabase.from("club_scoring_rules").select("stat, points"),
    supabase.from("appearance_points_tiers").select("min_minutes, points"),
    supabase.from("hat_trick_bonus_tiers").select("min_goals, points"),
    supabase.from("algorithm_versions").select("revision").order("revision", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const revision = (revisionRow?.revision ?? 0) + 1;
  const layerWeights: Record<string, number> = {};
  for (const row of layerWeightRows ?? []) {
    layerWeights[`${row.horizon}|${row.position}|${row.layer}`] = row.weight;
  }
  const scoringRules: Record<string, Record<string, number>> = {};
  for (const row of scoringRuleRows ?? []) {
    (scoringRules[row.stat] ??= {})[row.applies_to] = row.points;
  }
  const clubLayerWeights: Record<string, number> = {};
  for (const row of clubLayerWeightRows ?? []) {
    clubLayerWeights[`${row.horizon}|${row.layer}`] = row.weight;
  }
  const clubScoringRules = Object.fromEntries((clubScoringRuleRows ?? []).map((row) => [row.stat, row.points]));
  const appearancePointsTiers = Object.fromEntries((appearanceTierRows ?? []).map((row) => [row.min_minutes, row.points]));
  const hatTrickBonusTiers = Object.fromEntries((hatTrickTierRows ?? []).map((row) => [row.min_goals, row.points]));

  await supabase.from("algorithm_versions").insert({
    revision,
    weights: {
      layer_weights: layerWeights,
      scoring_rules: scoringRules,
      club_layer_weights: clubLayerWeights,
      club_scoring_rules: clubScoringRules,
      appearance_points_tiers: appearancePointsTiers,
      hat_trick_bonus_tiers: hatTrickBonusTiers,
    },
    created_by: actor,
    note,
  });
}
