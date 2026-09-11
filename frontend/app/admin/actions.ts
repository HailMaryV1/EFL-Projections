"use server";

import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabaseServerClient";

export async function signOut() {
  const supabase = await createAuthServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// No triggerRecompute() yet - .github/workflows/refresh_efl.yml doesn't
// exist until Phase 6 (deployment). Add it the same way dreamteam-
// projections' admin/actions.ts does once there's a real workflow to
// dispatch.
