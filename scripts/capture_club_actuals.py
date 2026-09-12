"""
capture_club_actuals.py
----------------------
New vs. dreamteam-projections (no equivalent there). Same mechanism as
capture_actuals.py, applied to the club side: fills in the real result
for every frozen club prediction whose gameweek has now actually been
played, copying `club_stats.total_points` into
`club_predictions_and_actuals.actual_points` once every real fixture for
that club in that gameweek has a `kickoff_at` already in the past.

`club_predictions_and_actuals` (migration 0014) has no `actual_minutes`
column at all - clubs don't have a minutes concept in this game - so
there is no minutes gap to document here the way capture_actuals.py has
to for players.

Same fixture gate as capture_actuals.py: this project's `fixtures` table
has no cup-competition concept (only `championship`/`league_one`/
`league_two`), so a plain "every real fixture for this team in this
gameweek has kicked off" check is the complete gate - no cup-leg-aware
logic needed.

Idempotent and safe to run as often as the rest of the pipeline - always
overwrites with the current real `club_stats` value, never skips an
already-captured row.

RUN:
    python scripts/capture_club_actuals.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from env_utils import db_connect  # noqa: E402

SEASON_DISPLAY = "2026/27"  # must match scrape_club_stats.py's own SEASON_DISPLAY


def main():
    conn = db_connect()
    conn.autocommit = False
    cur = conn.cursor()
    try:
        cur.execute(
            """
            update club_predictions_and_actuals cpa
            set actual_points = cs.total_points, actual_captured_at = now()
            from club_stats cs
            where cs.team_id = cpa.team_id and cs.gameweek = cpa.gameweek and cs.season = %s
              and cs.total_points is not null
              and exists (
                  select 1 from fixtures f
                  where f.gameweek = cs.gameweek and (f.home_team_id = cs.team_id or f.away_team_id = cs.team_id)
              )
              and not exists (
                  select 1 from fixtures f
                  where f.gameweek = cs.gameweek and (f.home_team_id = cs.team_id or f.away_team_id = cs.team_id)
                    and f.kickoff_at >= now()
              )
            """,
            (SEASON_DISPLAY,),
        )
        captured = cur.rowcount
        conn.commit()

        cur.execute("select count(*) from club_predictions_and_actuals where actual_points is null")
        still_pending = cur.fetchone()[0]
        print(f"Captured/refreshed {captured} real club actual result(s). {still_pending} frozen club prediction(s) still awaiting a played gameweek.")
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
