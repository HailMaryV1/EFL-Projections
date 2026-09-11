"""
scrape_fixtures.py
-------------------
Pulls real fixtures for all 3 divisions from fantasy.efl.com's own real,
free json/fantasy/rounds.json - each round carries its real `games` (home/
away by real squadId, real score, real status) and real per-game `events`
(consumed separately by scrape_player_stats.py/scrape_club_stats.py, not
here). A plain GET, no Playwright/browser automation needed.

RUN:
    python scripts/scrape_fixtures.py
"""

import sys
from pathlib import Path

import requests
from psycopg2.extras import execute_values

sys.path.insert(0, str(Path(__file__).resolve().parent))
from env_utils import db_connect

BASE = "https://fantasy.efl.com/json/fantasy"
COMPETITION_BY_ID = {10: "championship", 11: "league_one", 12: "league_two"}


def fetch_rounds():
    r = requests.get(f"{BASE}/rounds.json", timeout=60)
    r.raise_for_status()
    return r.json()


def main():
    rounds = fetch_rounds()
    conn = db_connect()
    conn.autocommit = False
    unresolved = 0
    rows = []
    try:
        with conn.cursor() as cur:
            cur.execute("select external_id, id from teams")
            team_ids = {ext: tid for ext, tid in cur.fetchall()}

            for round_ in rounds:
                gameweek = round_["roundNumber"]
                for game in round_.get("games", []):
                    competition = COMPETITION_BY_ID.get(game["competitionId"])
                    home_id = team_ids.get(str(game["homeId"]))
                    away_id = team_ids.get(str(game["awayId"]))
                    if competition is None or home_id is None or away_id is None:
                        unresolved += 1
                        continue
                    rows.append((competition, home_id, away_id, game["date"], gameweek, game.get("homeScore"), game.get("awayScore"), game.get("status")))

            # Batched (one round trip, not one per fixture) - same real
            # lesson already learned on scrape_player_stats.py.
            execute_values(
                cur,
                """
                insert into fixtures (competition, home_team_id, away_team_id, kickoff_at, gameweek, home_score, away_score, status)
                values %s
                on conflict (home_team_id, away_team_id, gameweek) do update set
                  kickoff_at = excluded.kickoff_at,
                  home_score = excluded.home_score,
                  away_score = excluded.away_score,
                  status = excluded.status
                """,
                rows,
            )
        conn.commit()
        print(f"Done - {len(rows)} fixtures written/updated across {len(rounds)} real gameweeks, {unresolved} unresolved.")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    if unresolved:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
