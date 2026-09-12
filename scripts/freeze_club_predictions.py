"""
freeze_club_predictions.py
-------------------------
New vs. dreamteam-projections (no equivalent there - Dream Team has no
club-picks side). Same freeze mechanism as freeze_predictions.py, applied
to the club side: snapshots each club's CURRENT gameweek projection
(horizon=1) into `club_predictions_and_actuals`, once, permanently -
`on conflict (team_id, gameweek) do nothing`, no UPDATE branch, so a
frozen club prediction never moves even as compute_club_projections.py
keeps recomputing `club_projections` closer to kickoff.

`club_predictions_and_actuals` (migration 0014) has no `predicted_rating`
column - clubs don't get a rating in this game (only players do) - so
only `predicted_points` is carried across.

Safe to run any time, as often as the rest of the pipeline, same
reasoning as freeze_predictions.py: a club only ever gets ONE frozen row
per gameweek, from whichever run first sees that gameweek as the club's
real horizon=1 (always still pre-kickoff for that club).

RUN:
    python scripts/freeze_club_predictions.py
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
        cur.execute("select max(algorithm_version_id) from club_projections")
        latest = cur.fetchone()[0]
        if latest is None:
            print("No club projections exist yet - run compute_club_projections.py first.")
            return

        cur.execute(
            """
            insert into club_predictions_and_actuals (team_id, gameweek, predicted_points)
            select team_id, gameweek, total_points
            from club_projections
            where horizon = 1 and algorithm_version_id = %s
            on conflict (team_id, gameweek) do nothing
            """,
            (latest,),
        )
        frozen = cur.rowcount
        conn.commit()
        print(f"Froze {frozen} new (team, gameweek) club prediction(s). Already-frozen gameweeks were left untouched.")
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
