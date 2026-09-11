"""
activity_log.py
------------------
One shared helper for writing to the activity_log table (migration 0015) -
used by every import/scrape script at the exact point it detects something
worth an audit trail entry, so there's one INSERT statement, not one copy
per caller.

Ported unchanged from dreamteam-projections/scripts/activity_log.py -
single-game (no game_id column - this whole project IS Fantasy EFL).

Not a standalone script - imported, no RUN section.
"""

import json


def log_event(cur, event_type, summary, *, actor=None, player_id=None, fixture_id=None, details=None):
    cur.execute(
        """
        insert into activity_log (event_type, actor, player_id, fixture_id, summary, details)
        values (%s, %s, %s, %s, %s, %s)
        """,
        (event_type, actor, player_id, fixture_id, summary, json.dumps(details or {}, default=str)),
    )
