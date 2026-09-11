import { createAuthServerClient } from "@/lib/supabaseServerClient";
import SiteHeaderClient from "./SiteHeaderClient";

// Thin async Server Component wrapper - checks the real Supabase Auth
// session and passes isAdmin down, same split dreamteam-projections uses,
// so every public page that renders <SiteHeader /> needs no changes if
// the auth-check logic ever changes.
export default async function SiteHeader() {
  const supabase = await createAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <SiteHeaderClient isAdmin={Boolean(user)} />;
}
