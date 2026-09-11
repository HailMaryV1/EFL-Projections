"""
seed_teams.py
-------------
Seeds `teams` from DreamTeamTonic's real fefl/squads endpoint - one real
call per division (the API doesn't return all three divisions in one
unfiltered call, confirmed live). Idempotent: upserts on external_id
(DreamTeamTonic's own real, stable squadId), safe to run repeatedly as
league positions/badges change.

RUN:
    python scripts/seed_teams.py
"""

import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from env_utils import db_connect
from activity_log import log_event

BASE = "https://dtt-data-api-259295136071.europe-west2.run.app/fefl"
SEASON = "202627"

# Our own competition value -> the real query-param spelling DreamTeamTonic's
# API expects (confirmed live: League One/Two use a hyphen, "league-one"/
# "league-two", not "leagueOne"/"leagueTwo").
COMPETITIONS = {"championship": "championship", "league_one": "league-one", "league_two": "league-two"}


def fetch_squads(competition_param):
    r = requests.get(f"{BASE}/squads", params={"season": SEASON, "competition": competition_param}, timeout=30)
    r.raise_for_status()
    return r.json()["squads"]


def upsert_team(cur, squad, competition):
    cur.execute(
        """
        insert into teams (external_id, name, short_name, abbreviation, competition, badge_url, background_color, text_color, league_position)
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        on conflict (external_id) do update set
          name = excluded.name,
          short_name = excluded.short_name,
          abbreviation = excluded.abbreviation,
          competition = excluded.competition,
          badge_url = excluded.badge_url,
          background_color = excluded.background_color,
          text_color = excluded.text_color,
          league_position = excluded.league_position
        returning id, (xmax = 0) as inserted
        """,
        (
            str(squad["squadId"]),
            squad["name"],
            squad.get("shortName"),
            squad.get("abbreviation"),
            competition,
            squad.get("lightBadge") or squad.get("darkBadge"),
            squad.get("backgroundColor"),
            squad.get("textColor"),
            squad.get("leaguePosition"),
        ),
    )
    return cur.fetchone()


def main():
    conn = db_connect()
    conn.autocommit = False
    inserted = updated = 0
    try:
        with conn.cursor() as cur:
            for competition, param in COMPETITIONS.items():
                squads = fetch_squads(param)
                for squad in squads:
                    _team_id, was_inserted = upsert_team(cur, squad, competition)
                    if was_inserted:
                        inserted += 1
                        log_event(cur, "team_added", f"{squad['name']} ({competition})", details={"squadId": squad["squadId"]})
                    else:
                        updated += 1
                print(f"{competition}: {len(squads)} real clubs")
        conn.commit()
        print(f"Done - {inserted} new, {updated} updated.")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
