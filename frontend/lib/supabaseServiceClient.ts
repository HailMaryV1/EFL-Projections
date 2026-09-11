import { createClient } from "@supabase/supabase-js";

/**
 * PRIVILEGED - bypasses Row Level Security entirely, same trust level as
 * the Python pipeline's own DATABASE_URL connection. Every other client in
 * this app (lib/supabaseServerClient.ts) is the public anon/publishable
 * key, RLS-gated - reference tables only have a "public read" policy, so
 * anything writing from a live admin action needs this instead.
 *
 * SUPABASE_SERVICE_ROLE_KEY is deliberately NOT prefixed NEXT_PUBLIC_ -
 * never bundled to the browser. Only call this from a "use server" action
 * or route handler, never a Client Component.
 *
 * Ported unchanged from dreamteam-projections/frontend/lib/
 * supabaseServiceClient.ts.
 */
export function createServiceSupabaseClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set - grab it from the Supabase dashboard (Project Settings > API Keys > Secret key) and add it to frontend/.env.local (and Vercel's env vars for production). Never prefix it NEXT_PUBLIC_."
    );
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
