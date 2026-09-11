"""
scrape_fixtures.py
-------------------
Pulls real fixtures for all 3 divisions from DreamTeamTonic's static
per-division JSON files - a plain GET, no Playwright/browser automation
needed at all (unlike dreamteam-projections' rolling-ticker scrape, which
needs a real browser because DreamTeamTonic only exposes Dream Team's own
fixtures via a rendered page, not a static file).

Resolves each fixture's home/away team-name strings against teams.name by
exact match - both this file and fefl/squads come from the same
DreamTeamTonic backend, so they're expected to agree; a genuine mismatch is
logged and that one fixture skipped, never guessed at.

RUN:
    python scripts/scrape_fixtures.py
"""

import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from env_utils import db_connect
from activity_log import log_event

FIXTURE_URLS = {
    "championship": "https://storage.googleapis.com/dttfixturelists/fefl-championshipFixtures.json",
    "league_one": "https://storage.googleapis.com/dttfixturelists/fefl-league-oneFixtures.json",
    "league_two": "https://storage.googleapis.com/dttfixturelists/fefl-league-twoFixtures.json",
}


def load_team_ids_by_name(cur):
    cur.execute("select name, id from teams")
    return dict(cur.fetchall())


def upsert_fixture(cur, competition, home_id, away_id, f):
    kickoff_at = datetime.fromtimestamp(f["timestamp"], tz=timezone.utc)
    home_score = away_score = None
    # Only a real, completed match has a trustworthy score - an upcoming
    # fixture's "score" field (if present at all) is never treated as real.
    if f.get("status") == "completed" and f.get("score"):
        parts = f["score"].split("-")
        if len(parts) == 2:
            home_score, away_score = int(parts[0]), int(parts[1])
    cur.execute(
        """
        insert into fixtures (competition, home_team_id, away_team_id, kickoff_at, gameweek, home_score, away_score, status)
        values (%s, %s, %s, %s, %s, %s, %s, %s)
        on conflict (home_team_id, away_team_id, gameweek) do update set
          kickoff_at = excluded.kickoff_at,
          home_score = excluded.home_score,
          away_score = excluded.away_score,
          status = excluded.status
        """,
        (competition, home_id, away_id, kickoff_at, f["gw"], home_score, away_score, f.get("status")),
    )


def main():
    conn = db_connect()
    conn.autocommit = False
    unresolved = []
    written = 0
    try:
        with conn.cursor() as cur:
            team_ids = load_team_ids_by_name(cur)
            for competition, url in FIXTURE_URLS.items():
                r = requests.get(url, timeout=30)
                r.raise_for_status()
                fixtures = r.json()
                for f in fixtures:
                    home_id = team_ids.get(f["home"])
                    away_id = team_ids.get(f["away"])
                    if home_id is None or away_id is None:
                        unresolved.append((competition, f["home"], f["away"]))
                        continue
                    upsert_fixture(cur, competition, home_id, away_id, f)
                    written += 1
                print(f"{competition}: {len(fixtures)} real fixtures")
            if unresolved:
                log_event(
                    cur,
                    "fixture_teams_unresolved",
                    f"{len(unresolved)} real fixtures had a team name that didn't exact-match teams.name",
                    details={"examples": unresolved[:20]},
                )
        conn.commit()
        print(f"Done - {written} fixtures written/updated, {len(unresolved)} unresolved.")
        if unresolved:
            print("Unresolved team names (real names to check against teams.name, or wire up name_matching.py if this is a real, recurring gap):")
            for c, h, a in unresolved[:20]:
                print(f"  {c}: {h} vs {a}")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    # CI visibility, same precedent as dreamteam-projections'
    # import_dreamteam_players.py: still commits everything that DID
    # resolve, but exits non-zero so an unresolved real team name doesn't
    # silently go unnoticed.
    if unresolved:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
