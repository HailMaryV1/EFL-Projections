"use server";

import { revalidatePath } from "next/cache";
import { createAuthServerClient } from "@/lib/supabaseServerClient";
import { createServiceSupabaseClient } from "@/lib/supabaseServiceClient";
import { bumpAlgorithmVersion, logActivity } from "@/lib/adminHelpers";
import { isAdminEmail } from "@/lib/adminAccess";

export async function saveScoringRules(formData: FormData) {
  const authClient = await createAuthServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user || !isAdminEmail(user.email)) throw new Error("Not authorized.");

  const supabase = createServiceSupabaseClient();
  let changed = 0;

  const [{ data: rules }, { data: appearanceTiers }, { data: hatTrickTiers }] = await Promise.all([
    supabase.from("scoring_rules").select("id, points"),
    supabase.from("appearance_points_tiers").select("id, points"),
    supabase.from("hat_trick_bonus_tiers").select("id, points"),
  ]);

  for (const rule of rules ?? []) {
    const raw = formData.get(`points_${rule.id}`);
    if (raw === null) continue;
    const value = Number(raw);
    if (Number.isNaN(value) || value === rule.points) continue;
    changed += 1;
    await supabase.from("scoring_rules").update({ points: value }).eq("id", rule.id);
  }
  for (const tier of appearanceTiers ?? []) {
    const raw = formData.get(`tier_appearance_${tier.id}`);
    if (raw === null) continue;
    const value = Number(raw);
    if (Number.isNaN(value) || value === tier.points) continue;
    changed += 1;
    await supabase.from("appearance_points_tiers").update({ points: value }).eq("id", tier.id);
  }
  for (const tier of hatTrickTiers ?? []) {
    const raw = formData.get(`tier_hattrick_${tier.id}`);
    if (raw === null) continue;
    const value = Number(raw);
    if (Number.isNaN(value) || value === tier.points) continue;
    changed += 1;
    await supabase.from("hat_trick_bonus_tiers").update({ points: value }).eq("id", tier.id);
  }

  if (changed > 0) {
    await logActivity(supabase, "scoring_rules_updated", `Updated ${changed} scoring rule(s)`, user.email ?? null);
    await bumpAlgorithmVersion(supabase, user.email ?? null, `Scoring rules edited via admin (${changed} change(s))`);
  }

  revalidatePath("/admin/scoring-rules");
  revalidatePath("/admin");
}
