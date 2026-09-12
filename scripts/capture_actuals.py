"""
capture_actuals.py
----------------------
Fills in the real result for every frozen prediction whose gameweek has
now actually been played - the other half of the freeze/capture pair
(freeze_predictions.py freezes the forecast; this fills in what really
happened, as each team's game completes). Real, direct values only:
`player_stats` already has a genuine per-gameweek row (real
`total_points`) once scrape_player_stats.py has captured that gameweek -
this just copies it across.

Known, permanent gap (see docs/data-and-weights.md's "Known limitations"
and migration 0003's own comment): this project's `player_stats` has NO
raw per-match minutes field at all - only `games_played`, a 0/1
appearance flag, not a minutes count. `actual_minutes` therefore stays
`null` for every captured row, deliberately - a 0/1 appearance flag is
not minutes, and this project's own "never fabricate a number" rule
means it is never backfilled from `games_played` or any other proxy.
This is the one real place this script's behaviour differs from
dreamteam-projections' own capture_actuals.py, which copies a genuine
`minutes_played` column PL's `player_stats` has and this one doesn't.

Fixture gate (adapted from dreamteam-projections' own real bug fix
2026-08-31: a player_stats row existing for a gameweek does NOT mean that
player's own fixture has actually kicked off): a frozen prediction is
only captured once every real fixture for that player's team in that
gameweek has a `kickoff_at` already in the past. Unlike PL, this
project's `fixtures` table (migration 0002) has no cup-competition
concept at all - `competition` is only ever `championship`/`league_one`/
`league_two`, and Fantasy EFL's own real scoring rules exclude cup
competitions entirely - so there is no cup-leg-aware "every fixture
across every competition" gating logic to port from PL's version; a
plain "does this team have a fixture in this gameweek, and has it
kicked off" check is the complete gate here.

Idempotent and safe to run as often as the rest of the pipeline -
harmless to re-copy an unchanged real result, and a genuinely later
correction is picked up automatically since this always overwrites with
the current real player_stats value, never skips an already-captured
row.

RUN:
    python scripts/capture_actuals.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from env_utils import db_connect  # noqa: E402

SEASON_DISPLAY = "2026/27"  # must match scrape_player_stats.py's own SEASON_DISPLAY


def main():
    conn = db_connect()
    conn.autocommit = False
    cur = conn.cursor()
    try:
        cur.execute(
            """
            update predictions_and_actuals pa
            set actual_points = ps.total_points, actual_captured_at = now()
            from player_stats ps
            join players p on p.id = ps.player_id
            where ps.player_id = pa.player_id and ps.gameweek = pa.gameweek and ps.season = %s
              and ps.total_points is not null
              and exists (
                  select 1 from fixtures f
                  where f.gameweek = ps.gameweek and (f.home_team_id = p.team_id or f.away_team_id = p.team_id)
              )
              and not exists (
                  select 1 from fixtures f
                  where f.gameweek = ps.gameweek and (f.home_team_id = p.team_id or f.away_team_id = p.team_id)
                    and f.kickoff_at >= now()
              )
            """,
            (SEASON_DISPLAY,),
        )
        captured = cur.rowcount
        conn.commit()

        cur.execute("select count(*) from predictions_and_actuals where actual_points is null")
        still_pending = cur.fetchone()[0]
        print(f"Captured/refreshed {captured} real actual result(s). {still_pending} frozen prediction(s) still awaiting a played gameweek.")
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
