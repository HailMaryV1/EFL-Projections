"""
freeze_predictions.py
-------------------------
Snapshots each player's CURRENT gameweek projection (horizon=1 - "this
week's" number) into `predictions_and_actuals`, once, permanently. This
is what turns a gameweek's projection into a real historical record
rather than a moving target: `projections` keeps changing as
compute_player_projections.py re-runs closer to kickoff with fresher
data, but once a gameweek's projection is frozen here it never changes
again - `on conflict (player_id, gameweek) do nothing`, deliberately no
UPDATE branch. Ported from dreamteam-projections/scripts/
freeze_predictions.py, trimmed to this project's own simpler
`predictions_and_actuals` shape (migration 0013): just `predicted_points`
and `predicted_rating`. This project's schema has no `predicted_xmins_
fraction`/`predicted_fixture_count`/`predicted_clean_sheet_expected`/
`predicted_goals_conceded_expected` columns - those came from Dream
Team's later migrations 0021/0022, which have no EFL equivalent, so
there is nothing further to carry across here.

Safe to run any time, as often as the rest of the pipeline: a player only
ever gets ONE frozen row per gameweek, from whichever run happens to be
the first to see that gameweek as their team's real horizon=1 - which,
thanks to compute_player_projections.py's per-team gameweek resolution,
is always a gameweek that hasn't kicked off for that team yet. So
freezing "whatever horizon=1 currently says" the moment it's available
already IS freezing a genuine pre-kickoff prediction - no separate
deadline/lock-time concept needed.

RUN:
    python scripts/freeze_predictions.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from env_utils import db_connect  # noqa: E402


def main():
    conn = db_connect()
    conn.autocommit = False
    cur = conn.cursor()
    try:
        cur.execute("select max(algorithm_version_id) from projections")
        latest = cur.fetchone()[0]
        if latest is None:
            print("No projections exist yet - run compute_player_projections.py first.")
            return

        cur.execute(
            """
            insert into predictions_and_actuals (player_id, gameweek, predicted_points, predicted_rating)
            select player_id, gameweek, total_points, rating
            from projections
            where horizon = 1 and algorithm_version_id = %s
            on conflict (player_id, gameweek) do nothing
            """,
            (latest,),
        )
        frozen = cur.rowcount
        conn.commit()
        print(f"Froze {frozen} new (player, gameweek) prediction(s). Already-frozen gameweeks were left untouched.")
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
