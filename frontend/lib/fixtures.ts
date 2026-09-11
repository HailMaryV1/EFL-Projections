// Real per-fixture entry shape written by compute_player_projections.py's
// project_layers into per_layer.fixture_quantity.fixtures (and the
// equivalent club-side shape in compute_club_projections.py) - read
// directly, never recomputed client-side.
export type FixtureEntry = {
  opponent: string;
  is_home: boolean;
  kickoff_at: string;
  gameweek: number;
  opponent_fdr: number | null;
};

export function formatFixture(f: FixtureEntry): string {
  return `${f.opponent} (${f.is_home ? "H" : "A"})`;
}

// Real official FDR scale (1-5, higher = harder) - same 5-tier colour
// convention already used site-wide in this product family, mapped onto
// this project's own real 1-5 values rather than DreamTeamTonic's ticker
// colour codes (dreamteam-projections has no equivalent input to match).
export function fdrColor(fdr: number | null): string | null {
  if (fdr === null) return null;
  if (fdr <= 1.5) return "#00ff87";
  if (fdr <= 2.5) return "#8f9bb0";
  if (fdr <= 3.5) return "#f6c945";
  if (fdr <= 4.5) return "#ff8a3d";
  return "#ff1751";
}
