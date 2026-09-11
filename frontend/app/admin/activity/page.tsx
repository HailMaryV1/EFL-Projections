import { createServiceSupabaseClient } from "@/lib/supabaseServiceClient";

export default async function ActivityLogPage() {
  const supabase = createServiceSupabaseClient();
  const { data: rows } = await supabase.from("activity_log").select("event_type, summary, actor, details, created_at").order("created_at", { ascending: false }).limit(100);

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold text-navy-100">Activity Log</h1>
      <p className="mt-1 text-sm text-navy-300">Every settings change, real and permanent - the last 100 entries.</p>

      <ul className="mt-6 divide-y divide-navy-800 text-sm">
        {(rows ?? []).map((row, i) => (
          <li key={i} className="py-3">
            <div className="flex items-center justify-between gap-4">
              <span className="font-medium text-navy-100">{row.summary ?? row.event_type}</span>
              <span className="shrink-0 text-xs text-navy-400">{new Date(row.created_at).toLocaleString("en-GB")}</span>
            </div>
            <p className="mt-0.5 text-xs text-navy-400">
              {row.event_type} {row.actor ? `· ${row.actor}` : ""}
            </p>
          </li>
        ))}
        {(rows ?? []).length === 0 && <li className="py-3 text-navy-400">Nothing logged yet.</li>}
      </ul>
    </div>
  );
}
