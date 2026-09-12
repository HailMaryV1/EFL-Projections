import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabaseServerClient";
import { isAdminEmail } from "@/lib/adminAccess";
import AdminSidebar from "./AdminSidebar";
import { signOut } from "./actions";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/scoring-rules", label: "Scoring Rules" },
  { href: "/admin/club-scoring-rules", label: "Club Scoring Rules" },
  { href: "/admin/layer-weights", label: "Layer Weights" },
  { href: "/admin/club-layer-weights", label: "Club Layer Weights" },
  { href: "/admin/rating-anchors", label: "Rating Anchors" },
  { href: "/admin/accuracy", label: "Accuracy" },
  { href: "/admin/activity", label: "Activity Log" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // proxy.ts already redirects an unauthenticated visitor before this ever
  // renders - this is defense in depth, not the only gate.
  const supabase = await createAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    redirect("/login");
  }

  return (
    <div className="flex flex-1 flex-col sm:flex-row">
      <AdminSidebar navItems={NAV} email={user.email ?? ""} signOutAction={signOut} />
      <main className="min-w-0 flex-1 p-4 sm:p-8">{children}</main>
    </div>
  );
}
