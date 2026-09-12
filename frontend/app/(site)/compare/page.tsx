import { createAuthServerClient } from "@/lib/supabaseServerClient";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { loadComparePlayer } from "@/lib/comparePlayer";
import PlayerPicker, { type PlayerOption } from "./PlayerPicker";
import CompareView, { type ComparePlayer } from "./CompareView";

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }) {
  const { a, b } = await searchParams;
  const supabase = await createAuthServerClient();

  type Row = { id: number; full_name: string; position: PlayerOption["position"]; teams: { name: string } | null };
  const rows = await fetchAllRows<Row>((from, to) =>
    supabase
      .from("players")
      .select("id, full_name, position, teams!team_id(name)")
      .eq("is_active", true)
      .not("position", "is", null)
      .order("full_name")
      .order("id") // tiebreak for duplicate names - see best-squad/page.tsx's fix for the full reasoning
      .range(from, to) as unknown as PromiseLike<{ data: Row[] | null; error: { message: string } | null }>
  );
  const options: PlayerOption[] = rows.map((r) => ({ id: r.id, name: r.full_name, position: r.position, team: r.teams?.name ?? "—" }));

  const idA = a ? Number(a) : null;
  const idB = b ? Number(b) : null;

  let playerA: ComparePlayer | null = null;
  let playerB: ComparePlayer | null = null;
  if (idA && idB) {
    [playerA, playerB] = await Promise.all([loadComparePlayer(supabase, idA), loadComparePlayer(supabase, idB)]);
  }

  return (
    <main className="mx-auto w-full min-w-0 max-w-4xl flex-1 p-4 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-wide text-sky-400">Head-to-Head</p>
        <h1 className="font-[family-name:var(--font-cond)] text-4xl font-extrabold text-navy-100">Player Face-Off</h1>
        <p className="mt-2 max-w-2xl text-sm text-navy-300">
          Pick two players — real projected points across every horizon, real season stats, real ownership, and each one&apos;s
          real upcoming fixture run, side by side.
        </p>

        <div className="mt-6">
          <PlayerPicker options={options} selectedA={idA} selectedB={idB} />
        </div>

        {playerA && playerB && (
          <div className="mt-8">
            <CompareView playerA={playerA} playerB={playerB} />
          </div>
        )}
        {(idA || idB) && (!playerA || !playerB) && <p className="mt-8 text-sm text-navy-400">Pick a second player to compare.</p>}
    </main>
  );
}
