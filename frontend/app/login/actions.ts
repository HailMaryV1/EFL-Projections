"use server";

import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabaseServerClient";

export async function signIn(_prevState: string | null, formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createAuthServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return error.message;
  }
  redirect("/admin");
}
