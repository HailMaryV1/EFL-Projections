"use server";

import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabaseServerClient";

export async function signOut() {
  const supabase = await createAuthServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

const GITHUB_REPO = "HailMaryV1/EFL-Projections";
const GITHUB_WORKFLOW_FILE = "refresh_efl.yml";

/**
 * Triggers .github/workflows/refresh_efl.yml on demand via GitHub's
 * workflow_dispatch API - same pattern as dreamteam-projections' own
 * admin/actions.ts. Needs a real GitHub token with Actions write access
 * on this repo (fine-grained PAT, repo-scoped) in GITHUB_ACTIONS_TOKEN -
 * never NEXT_PUBLIC_, server-only.
 */
export async function triggerRecompute() {
  const authClient = await createAuthServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const token = process.env.GITHUB_ACTIONS_TOKEN;
  if (!token) {
    return { ok: false as const, message: "GITHUB_ACTIONS_TOKEN isn't set yet - see CLAUDE.md for how to generate one." };
  }

  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW_FILE}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main" }),
  });

  if (!res.ok) {
    const body = await res.text();
    return { ok: false as const, message: `GitHub rejected the trigger (${res.status}): ${body}` };
  }
  return { ok: true as const, message: "Triggered - check the Actions tab on GitHub for progress (usually a few minutes)." };
}
