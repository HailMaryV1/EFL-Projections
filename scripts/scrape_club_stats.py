"""
scrape_club_stats.py
---------------------
Real per-club stats from DreamTeamTonic's fefl/club-stats-by-gw - feeds the
club-pick side of Fantasy EFL's scoring (win/draw/away win/clean sheet/2+
goals - see club_scoring_rules, migration 0007). Same season-aggregate +
per-gameweek pattern as scrape_player_stats.py, batched with
psycopg2.extras.execute_values the same way (one round trip per ~72-club
response, not one per club).

Note: this endpoint has no real "4+ goal games" field (only twoGoalGames) -
club_stats.four_plus_goal_games is left null here, not fabricated (see
docs/data-and-weights.md "Known limitations").

RUN:
    python scripts/scrape_club_stats.py
"""

import sys
from pathlib import Path

import requests
from psycopg2.extras import execute_values

sys.path.insert(0, str(Path(__file__).resolve().parent))
from env_utils import db_connect

BASE = "https://dtt-data-api-259295136071.europe-west2.run.app/fefl"
SEASON = "202627"
SEASON_DISPLAY = "2026/27"

FIELD_TO_COLUMN = {
    "gamesPlayed": "games_played",
    "cleanSheets": "clean_sheets",
    "goalsScored": "goals_scored",
    "goalsConceded": "goals_conceded",
    "twoGoalGames": "two_plus_goal_games",
    "leaguePoints": "league_points",
    "leaguePosition": "league_position",
    "leagueGoalsFor": "league_goals_for",
    "leagueGoalsAgainst": "league_goals_against",
}


def fetch_current_gameweek():
    r = requests.get(f"{BASE}/current-gameweek", params={"season": SEASON}, timeout=30)
    r.raise_for_status()
    return r.json()


def fetch_club_stats(from_gw, to_gw):
    r = requests.get(f"{BASE}/club-stats-by-gw", params={"fromGW": from_gw, "toGW": to_gw, "season": SEASON}, timeout=60)
    r.raise_for_status()
    return r.json()["clubs"]


def upsert_club_stats_batch(cur, gameweek, clubs, team_ids_by_external):
    stat_columns = list(FIELD_TO_COLUMN.values())
    columns = ["team_id", "season", "gameweek", "total_points"] + stat_columns
    rows = []
    unresolved = 0
    for c in clubs:
        team_id = team_ids_by_external.get(str(c["squadId"]))
        if team_id is None:
            unresolved += 1
            continue
        rows.append((team_id, SEASON_DISPLAY, gameweek, c.get("totalPoints")) + tuple(c.get(f) for f in FIELD_TO_COLUMN))
    if not rows:
        return 0, unresolved

    update_cols = [col for col in columns if col not in ("team_id", "season", "gameweek")]
    update_clause = ", ".join(f"{c} = excluded.{c}" for c in update_cols)
    conflict_target = "(team_id, season) where gameweek is null" if gameweek is None else "(team_id, season, gameweek)"
    execute_values(
        cur,
        f"insert into club_stats ({', '.join(columns)}) values %s on conflict {conflict_target} do update set {update_clause}",
        rows,
    )
    return len(rows), unresolved


def main():
    conn = db_connect()
    conn.autocommit = False
    total_unresolved = 0
    try:
        with conn.cursor() as cur:
            cur.execute("select external_id, id from teams")
            team_ids_by_external = dict(cur.fetchall())

            current = fetch_current_gameweek()
            current_gw = current["currentGameweek"]
            total_gws = current["totalGameweeks"]

            season_clubs = fetch_club_stats(1, total_gws)
            written, unresolved = upsert_club_stats_batch(cur, None, season_clubs, team_ids_by_external)
            total_unresolved += unresolved
            print(f"Season aggregate: {written} real clubs ({unresolved} unresolved)", flush=True)

            for gw in range(1, current_gw + 1):
                gw_clubs = fetch_club_stats(gw, gw)
                written, unresolved = upsert_club_stats_batch(cur, gw, gw_clubs, team_ids_by_external)
                print(f"GW{gw}: {written} real club rows written", flush=True)

        conn.commit()
        print("Done.", flush=True)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    if total_unresolved:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
