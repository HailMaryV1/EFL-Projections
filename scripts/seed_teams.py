"""
seed_teams.py
-------------
Seeds `teams` from fantasy.efl.com's own real, free, unauthenticated JSON
(json/fantasy/squads.json + json/fantasy/competitions.json) - the
official game's own data, not a third-party mirror. Real pivot 2026-09:
DreamTeamTonic's free fefl/squads endpoint gave the same real FDR/badge
fields, but its sibling player-stats endpoint turned out to return
genuine zeros for every per-event stat (see CLAUDE.md Status) - switching
the whole pipeline to fantasy.efl.com's own JSON keeps everything on one
single, verified-real source instead of two.

Idempotent: upserts on external_id (the official site's own real squad id).

RUN:
    python scripts/seed_teams.py
"""

import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from env_utils import db_connect
from activity_log import log_event

BASE = "https://fantasy.efl.com/json/fantasy"

# fantasy.efl.com's own real competitionId -> our competition value
# (confirmed live via json/fantasy/competitions.json: 10=Championship,
# 11=League One, 12=League Two).
COMPETITION_BY_ID = {10: "championship", 11: "league_one", 12: "league_two"}


def fetch_json(path):
    r = requests.get(f"{BASE}/{path}", timeout=30)
    r.raise_for_status()
    return r.json()


def upsert_team(cur, squad):
    competition = COMPETITION_BY_ID.get(squad["competitionId"])
    if competition is None:
        return None, False
    cur.execute(
        """
        insert into teams (external_id, name, short_name, abbreviation, competition, badge_url, background_color, text_color, league_position, fdr_home, fdr_away)
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        on conflict (external_id) do update set
          name = excluded.name,
          short_name = excluded.short_name,
          abbreviation = excluded.abbreviation,
          competition = excluded.competition,
          badge_url = excluded.badge_url,
          background_color = excluded.background_color,
          text_color = excluded.text_color,
          league_position = excluded.league_position,
          fdr_home = excluded.fdr_home,
          fdr_away = excluded.fdr_away
        returning id, (xmax = 0) as inserted
        """,
        (
            str(squad["id"]),
            squad["name"],
            squad.get("shortName"),
            squad.get("abbreviation"),
            competition,
            squad.get("lightBadge") or squad.get("darkBadge"),
            squad.get("backgroundColor"),
            squad.get("textColor"),
            squad.get("leaguePosition"),
            squad.get("fdrHome"),
            squad.get("fdrAway"),
        ),
    )
    return cur.fetchone()


def main():
    squads = fetch_json("squads.json")
    conn = db_connect()
    conn.autocommit = False
    inserted = updated = skipped = 0
    try:
        with conn.cursor() as cur:
            for squad in squads:
                result = upsert_team(cur, squad)
                if result == (None, False):
                    skipped += 1
                    continue
                _team_id, was_inserted = result
                if was_inserted:
                    inserted += 1
                    log_event(cur, "team_added", f"{squad['name']}", details={"squadId": squad["id"]})
                else:
                    updated += 1
        conn.commit()
        print(f"Done - {inserted} new, {updated} updated, {skipped} skipped (unrecognised competitionId).")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
