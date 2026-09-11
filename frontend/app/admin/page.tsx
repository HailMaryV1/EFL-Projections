import { createServiceSupabaseClient } from "@/lib/supabaseServiceClient";
import RecomputeButton from "./RecomputeButton";

export default async function AdminOverviewPage() {
  const supabase = createServiceSupabaseClient();

  const [{ count: playerCount }, { count: teamCount }, { count: projectionCount }, { count: clubProjectionCount }, { data: latestVersion }, { data: recentActivity }] =
    await Promise.all([
      supabase.from("players").select("*", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("teams").select("*", { count: "exact", head: true }),
      supabase.from("projections").select("*", { count: "exact", head: true }),
      supabase.from("club_projections").select("*", { count: "exact", head: true }),
      supabase.from("algorithm_versions").select("revision, created_at, note").order("revision", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("activity_log").select("event_type, summary, actor, created_at").order("created_at", { ascending: false }).limit(8),
    ]);

  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="text-2xl font-semibold text-navy-100">Overview</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Active players" value={playerCount ?? 0} />
        <Stat label="Clubs" value={teamCount ?? 0} />
        <Stat label="Player projections" value={projectionCount ?? 0} />
        <Stat label="Club projections" value={clubProjectionCount ?? 0} />
      </div>

      {latestVersion && (
        <p className="text-sm text-navy-300">
          Revision {latestVersion.revision} generated {new Date(latestVersion.created_at).toLocaleString("en-GB")} — {latestVersion.note}
        </p>
      )}

      <RecomputeButton />

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-navy-300">Recent activity</h2>
        <ul className="divide-y divide-navy-800 text-sm">
          {(recentActivity ?? []).map((row, i) => (
            <li key={i} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <span className="text-navy-200">{row.summary ?? row.event_type}</span>
              <span className="shrink-0 text-navy-400">{new Date(row.created_at).toLocaleString("en-GB")}</span>
            </li>
          ))}
          {(recentActivity ?? []).length === 0 && <li className="py-2 text-navy-400">No settings changes yet.</li>}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-navy-800 bg-navy-900 p-4">
      <p className="text-2xl font-semibold tabular-nums text-navy-100">{value}</p>
      <p className="text-xs text-navy-300">{label}</p>
    </div>
  );
}
