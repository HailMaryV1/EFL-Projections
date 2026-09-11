import { createServiceSupabaseClient } from "@/lib/supabaseServiceClient";
import { saveScoringRules } from "./actions";

export default async function ScoringRulesPage() {
  const supabase = createServiceSupabaseClient();
  const [{ data: rules }, { data: appearanceTiers }, { data: hatTrickTiers }] = await Promise.all([
    supabase.from("scoring_rules").select("id, applies_to, stat, points, notes").order("stat").order("applies_to"),
    supabase.from("appearance_points_tiers").select("id, min_minutes, points").order("min_minutes"),
    supabase.from("hat_trick_bonus_tiers").select("id, min_goals, points").order("min_goals"),
  ]);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-navy-100">Scoring Rules</h1>
      <p className="mt-1 text-sm text-navy-300">
        Fantasy EFL&rsquo;s real point values per stat, from the official Game Guidelines. These feed every per-stat expected-
        count calculation directly - compute_player_projections.py reads these exact numbers, no hardcoded copy anywhere else.
      </p>

      <form action={saveScoringRules} className="mt-6 space-y-1">
        <div className="grid grid-cols-[1fr_100px_100px] gap-x-4 border-b border-navy-800 pb-2 text-xs font-semibold uppercase tracking-wide text-navy-400">
          <span>Stat</span>
          <span>Applies to</span>
          <span>Points</span>
        </div>
        {(rules ?? []).map((rule) => (
          <div key={rule.id} className="grid grid-cols-[1fr_100px_100px] items-center gap-x-4 border-b border-navy-800/60 py-2 text-sm">
            <div className="text-navy-200">
              {rule.stat.replace(/_/g, " ")}
              {rule.notes && <p className="text-xs text-navy-400">{rule.notes}</p>}
            </div>
            <span className="text-navy-300">{rule.applies_to}</span>
            <input
              name={`points_${rule.id}`}
              type="number"
              step="0.001"
              defaultValue={rule.points}
              className="w-24 rounded-md border border-navy-700 bg-navy-950 px-2 py-1 tabular-nums text-navy-100 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
            />
          </div>
        ))}

        <div className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-navy-300">Tiered rules</h2>
          <p className="mt-1 text-xs text-navy-400">
            Two real rules that aren&rsquo;t a flat rate - appearance points (1-59min vs. 60+min, mutually exclusive) and the
            hat-trick bonus (3+ real goals in a match, on top of normal per-goal points).
          </p>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-navy-400">Appearance points (by minimum minutes)</p>
          {(appearanceTiers ?? []).map((tier) => (
            <div key={tier.id} className="mt-1 grid grid-cols-[1fr_100px] items-center gap-x-4 border-b border-navy-800/60 py-2 text-sm">
              <span className="text-navy-200">{tier.min_minutes}+ minutes</span>
              <input
                name={`tier_appearance_${tier.id}`}
                type="number"
                step="0.5"
                defaultValue={tier.points}
                className="w-24 rounded-md border border-navy-700 bg-navy-950 px-2 py-1 tabular-nums text-navy-100 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
              />
            </div>
          ))}

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-navy-400">Hat-trick bonus (by minimum goals in a match)</p>
          {(hatTrickTiers ?? []).map((tier) => (
            <div key={tier.id} className="mt-1 grid grid-cols-[1fr_100px] items-center gap-x-4 border-b border-navy-800/60 py-2 text-sm">
              <span className="text-navy-200">{tier.min_goals}+ goals</span>
              <input
                name={`tier_hattrick_${tier.id}`}
                type="number"
                step="0.5"
                defaultValue={tier.points}
                className="w-24 rounded-md border border-navy-700 bg-navy-950 px-2 py-1 tabular-nums text-navy-100 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
              />
            </div>
          ))}
        </div>

        <button type="submit" className="mt-6 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500">
          Save changes
        </button>
      </form>
    </div>
  );
}
