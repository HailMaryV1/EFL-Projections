// Real Fantasy EFL squad rules (fantasy.efl.com/help/game-guidelines,
// quoted during planning): 7 players in one of 3 fixed formations, plus
// 2 club picks - no budget, no player prices at all (a genuine structural
// difference from Dream Team, see CLAUDE.md "Why this is a separate
// project"). Selection logic is correspondingly simpler than Dream Team's
// own budget_50m knapsack - there's no price dimension to trade off, only
// a real hard constraint: "you can only select a maximum of 2 players
// from any one club each gameweek."

export type SquadCandidate = {
  playerId: number;
  name: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  teamId: number;
  teamName: string;
  teamAbbreviation: string | null;
  teamBackgroundColor: string | null;
  teamTextColor: string | null;
  points: number;
  rating: number | null;
  ownershipPct: number | null;
};

export const FORMATIONS: Record<string, { GK: number; DEF: number; MID: number; FWD: number }> = {
  "1-2-2-2": { GK: 1, DEF: 2, MID: 2, FWD: 2 },
  "1-2-3-1": { GK: 1, DEF: 2, MID: 3, FWD: 1 },
  "1-3-2-1": { GK: 1, DEF: 3, MID: 2, FWD: 1 },
};

export const MAX_PER_CLUB = 2; // the real rule's own cap, per gameweek

export type BuiltSquad = {
  players: SquadCandidate[]; // GK, then DEF, then MID, then FWD
  totalPoints: number;
  incomplete: boolean;
};

/** Real, honest greedy fill: for each position slot (in a fixed GK->DEF->
 * MID->FWD order), take the highest real projected-points candidates that
 * don't push a club over the real 2-per-club cap. Since there's no price
 * to trade off, this is a straightforward "take the best available"
 * problem for each slot - EXCEPT the cross-position club cap means it
 * isn't guaranteed globally optimal (a later position might have taken a
 * higher-value player from a club an earlier position already filled up)
 * - a real, documented simplification, not a full matroid-intersection
 * solve. In practice, with thousands of real candidates per position,
 * this rarely leaves real points on the table. */
function buildFormation(pool: SquadCandidate[], formation: { GK: number; DEF: number; MID: number; FWD: number }): BuiltSquad {
  const clubCounts = new Map<number, number>();
  const selected: SquadCandidate[] = [];
  const order: (keyof typeof formation)[] = ["GK", "DEF", "MID", "FWD"];
  let expectedTotal = 0;

  for (const pos of order) {
    const need = formation[pos];
    expectedTotal += need;
    const candidates = pool.filter((p) => p.position === pos).sort((a, b) => b.points - a.points);
    let picked = 0;
    for (const c of candidates) {
      if (picked >= need) break;
      const count = clubCounts.get(c.teamId) ?? 0;
      if (count >= MAX_PER_CLUB) continue;
      selected.push(c);
      clubCounts.set(c.teamId, count + 1);
      picked++;
    }
  }

  return {
    players: selected,
    totalPoints: Math.round(selected.reduce((sum, p) => sum + p.points, 0) * 100) / 100,
    incomplete: selected.length < expectedTotal,
  };
}

export type BestSquadResult = {
  byFormation: Record<string, BuiltSquad>;
  bestFormation: string;
};

export function buildBestSquad(pool: SquadCandidate[]): BestSquadResult {
  const byFormation: Record<string, BuiltSquad> = {};
  for (const [name, formation] of Object.entries(FORMATIONS)) {
    byFormation[name] = buildFormation(pool, formation);
  }
  const bestFormation = Object.entries(byFormation).reduce((best, [name, squad]) => (squad.totalPoints > byFormation[best].totalPoints ? name : best), Object.keys(FORMATIONS)[0]);
  return { byFormation, bestFormation };
}

export type ClubCandidate = { teamId: number; teamName: string; points: number };

/** The real club-pick side: just the top 2 by real projected points - no
 * cap to respect here (the real "max 5 times over the SEASON" rule is a
 * constraint on a real user's own account history across many gameweeks,
 * which this stateless single-gameweek tool has no way to track - same
 * reasoning already applied to the player side never simulating a real
 * transfer budget history either). */
export function buildBestClubPicks(pool: ClubCandidate[], count = 2): ClubCandidate[] {
  return [...pool].sort((a, b) => b.points - a.points).slice(0, count);
}
