"use server";

import { revalidatePath } from "next/cache";
import { createAuthServerClient } from "@/lib/supabaseServerClient";
import { createServiceSupabaseClient } from "@/lib/supabaseServiceClient";
import { bumpAlgorithmVersion, logActivity } from "@/lib/adminHelpers";
import { isAdminEmail } from "@/lib/adminAccess";

export async function saveClubLayerWeights(formData: FormData) {
  const authClient = await createAuthServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user || !isAdminEmail(user.email)) throw new Error("Not authorized.");

  const supabase = createServiceSupabaseClient();
  const { data: rows } = await supabase.from("club_layer_weights").select("id, horizon, layer, weight");

  let changed = 0;
  for (const row of rows ?? []) {
    const raw = formData.get(`weight_${row.id}`);
    if (raw === null) continue;
    const value = Number(raw);
    if (Number.isNaN(value) || value === row.weight) continue;
    changed += 1;
    await supabase.from("club_layer_weights").update({ weight: value }).eq("id", row.id);
  }

  if (changed > 0) {
    await logActivity(supabase, "club_layer_weights_updated", `Updated ${changed} club layer weight(s)`, user.email ?? null);
    await bumpAlgorithmVersion(supabase, user.email ?? null, `Club layer weights edited via admin (${changed} change(s))`);
  }

  revalidatePath("/admin/club-layer-weights");
  revalidatePath("/admin");
}
