"use server";

import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabaseServerClient";
import { isAdminEmail } from "@/lib/adminAccess";

export async function signIn(_prevState: string | null, formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createAuthServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return error.message;
  }
  // Real fix 2026-09-16 (ported from dreamteam-projections): a correct
  // password used to be enough to reach /admin, which only then checked
  // "signed in" - any real Supabase account with valid credentials could
  // sign in here and just bounce between /login and /admin forever rather
  // than getting told why. Rejecting a non-admin email here, immediately,
  // with its own real session torn back down, is a clearer failure than
  // that loop.
  if (!isAdminEmail(data.user?.email)) {
    await supabase.auth.signOut();
    return "This account isn't authorized for admin access.";
  }
  redirect("/admin");
}
