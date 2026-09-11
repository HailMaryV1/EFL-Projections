"use server";

import { revalidatePath } from "next/cache";
import { createAuthServerClient } from "@/lib/supabaseServerClient";
import { createServiceSupabaseClient } from "@/lib/supabaseServiceClient";
import { bumpAlgorithmVersion, logActivity } from "@/lib/adminHelpers";

export async function saveClubScoringRules(formData: FormData) {
  const authClient = await createAuthServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const supabase = createServiceSupabaseClient();
  const { data: rules } = await supabase.from("club_scoring_rules").select("id, stat, points");

  const changes: { id: number; stat: string; from: number; to: number }[] = [];
  for (const rule of rules ?? []) {
    const raw = formData.get(`points_${rule.id}`);
    if (raw === null) continue;
    const value = Number(raw);
    if (Number.isNaN(value) || value === rule.points) continue;
    changes.push({ id: rule.id, stat: rule.stat, from: rule.points, to: value });
    await supabase.from("club_scoring_rules").update({ points: value }).eq("id", rule.id);
  }

  if (changes.length > 0) {
    await logActivity(supabase, "club_scoring_rules_updated", `Updated ${changes.length} club scoring rule(s)`, user.email ?? null, { changes });
    await bumpAlgorithmVersion(supabase, user.email ?? null, `Club scoring rules edited via admin (${changes.length} change(s))`);
  }

  revalidatePath("/admin/club-scoring-rules");
  revalidatePath("/admin");
}
