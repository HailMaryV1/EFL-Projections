import { createServiceSupabaseClient } from "@/lib/supabaseServiceClient";
import { saveClubScoringRules } from "./actions";

export default async function ClubScoringRulesPage() {
  const supabase = createServiceSupabaseClient();
  const { data: rules } = await supabase.from("club_scoring_rules").select("id, stat, points, notes").order("stat");

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold text-navy-100">Club Scoring Rules</h1>
      <p className="mt-1 text-sm text-navy-300">
        Real points for the 2-club-pick side of Fantasy EFL - genuinely new vs. Dream Team, which has no club-pick mechanic.
        compute_club_projections.py reads these exact numbers.
      </p>

      <form action={saveClubScoringRules} className="mt-6 space-y-1">
        <div className="grid grid-cols-[1fr_100px] gap-x-4 border-b border-navy-800 pb-2 text-xs font-semibold uppercase tracking-wide text-navy-400">
          <span>Stat</span>
          <span>Points</span>
        </div>
        {(rules ?? []).map((rule) => (
          <div key={rule.id} className="grid grid-cols-[1fr_100px] items-center gap-x-4 border-b border-navy-800/60 py-2 text-sm">
            <div className="text-navy-200">
              {rule.stat.replace(/_/g, " ")}
              {rule.notes && <p className="text-xs text-navy-400">{rule.notes}</p>}
            </div>
            <input
              name={`points_${rule.id}`}
              type="number"
              step="0.5"
              defaultValue={rule.points}
              className="w-24 rounded-md border border-navy-700 bg-navy-950 px-2 py-1 tabular-nums text-navy-100 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
            />
          </div>
        ))}
        <button type="submit" className="mt-6 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500">
          Save changes
        </button>
      </form>
    </div>
  );
}
