"""
scrape_club_stats.py
---------------------
Real per-club stats, derived entirely from fantasy.efl.com's own real
json/fantasy/rounds.json match results (home/away score per real game) -
feeds the club-pick side of Fantasy EFL's scoring (win/draw/away win/
clean sheet/2+/4+ goals - see club_scoring_rules, migration 0007). Real
pivot 2026-09 (see CLAUDE.md Status): this used to call DreamTeamTonic's
own fefl/club-stats-by-gw endpoint, but once that project's sibling
player-stats endpoint was confirmed to return real zeros throughout, the
whole pipeline moved onto fantasy.efl.com's own JSON as the single
verified-real source instead - rounds.json already has everything needed
to derive real club results directly, no separate club endpoint required.

RUN:
    python scripts/scrape_club_stats.py
"""

import sys
from pathlib import Path

import requests
from psycopg2.extras import execute_values

sys.path.insert(0, str(Path(__file__).resolve().parent))
from env_utils import db_connect

BASE = "https://fantasy.efl.com/json/fantasy"
SEASON_DISPLAY = "2026/27"
CLUB_STAT_COLUMNS = [
    "games_played", "wins", "draws", "losses", "away_wins",
    "goals_scored", "goals_conceded", "clean_sheets", "two_plus_goal_games", "four_plus_goal_games",
    "league_points", "league_goals_for", "league_goals_against", "total_points",
]


def fetch_json(path):
    r = requests.get(f"{BASE}/{path}", timeout=60)
    r.raise_for_status()
    return r.json()


def blank_stats():
    return {col: 0 for col in CLUB_STAT_COLUMNS}


def apply_result(stats, goals_for, goals_against, is_away):
    stats["games_played"] += 1
    stats["goals_scored"] += goals_for
    stats["goals_conceded"] += goals_against
    if goals_against == 0:
        stats["clean_sheets"] += 1
    if goals_for >= 2:
        stats["two_plus_goal_games"] += 1
    if goals_for >= 4:
        stats["four_plus_goal_games"] += 1
    if goals_for > goals_against:
        stats["wins"] += 1
        stats["league_points"] += 3
        if is_away:
            stats["away_wins"] += 1
    elif goals_for == goals_against:
        stats["draws"] += 1
        stats["league_points"] += 1
    else:
        stats["losses"] += 1
    stats["league_goals_for"] += goals_for
    stats["league_goals_against"] += goals_against


def build_round_and_season_stats(rounds):
    """Real per-round club results plus a running season aggregate,
    derived purely from real completed match scores - a game that hasn't
    finished yet (no real score) contributes nothing, never a guess.

    Real bug fixed 2026-09-12: fantasy.efl.com's own rounds.json returns a
    genuine DUPLICATE round object (same real roundNumber, empty `games`)
    for early rounds (confirmed live: rounds 1-3 each appeared twice, the
    second copy with 0 games). Games are grouped by roundNumber FIRST so
    each real round is processed exactly once - the naive per-object loop
    this replaced re-ran the season-accumulation step once per *object*,
    silently double-counting every stat (games_played, wins, goals, etc)
    for any round with a duplicate, which in turn deflated every player's
    real xmins_fraction (games_played / inflated team_games_played) and
    suppressed every projected stat that multiplies by it."""
    games_by_round = {}
    for round_ in rounds:
        games_by_round.setdefault(round_["roundNumber"], []).extend(round_.get("games", []))

    per_round = {}
    season = {}
    for round_number in sorted(games_by_round):
        bucket = per_round.setdefault(round_number, {})
        for game in games_by_round[round_number]:
            if game.get("status") != "completed" or game.get("homeScore") is None or game.get("awayScore") is None:
                continue
            home_id, away_id = str(game["homeId"]), str(game["awayId"])
            home_stats = bucket.setdefault(home_id, blank_stats())
            away_stats = bucket.setdefault(away_id, blank_stats())
            apply_result(home_stats, game["homeScore"], game["awayScore"], is_away=False)
            apply_result(away_stats, game["awayScore"], game["homeScore"], is_away=True)

        for squad_id, round_stats in bucket.items():
            season_stats = season.setdefault(squad_id, blank_stats())
            for col in CLUB_STAT_COLUMNS:
                if col != "total_points":
                    season_stats[col] += round_stats[col]
    return per_round, season


def upsert_club_stats_batch(cur, gameweek, entries):
    columns = ["team_id", "season", "gameweek"] + CLUB_STAT_COLUMNS
    rows = [(team_id, SEASON_DISPLAY, gameweek) + tuple(stats.get(c) for c in CLUB_STAT_COLUMNS) for team_id, stats in entries]
    if not rows:
        return 0
    update_cols = [c for c in columns if c not in ("team_id", "season", "gameweek")]
    update_clause = ", ".join(f"{c} = excluded.{c}" for c in update_cols)
    conflict_target = "(team_id, season) where gameweek is null" if gameweek is None else "(team_id, season, gameweek)"
    execute_values(
        cur,
        f"insert into club_stats ({', '.join(columns)}) values %s on conflict {conflict_target} do update set {update_clause}",
        rows,
    )
    return len(rows)


def main():
    conn = db_connect()
    conn.autocommit = False
    unresolved = 0
    try:
        with conn.cursor() as cur:
            cur.execute("select external_id, id from teams")
            team_ids_by_external = dict(cur.fetchall())

            squads = fetch_json("squads.json")
            squads_by_external = {str(s["id"]): s for s in squads}
            rounds = fetch_json("rounds.json")
            per_round, season = build_round_and_season_stats(rounds)

            # league_position and total_points are real DIRECT fields on
            # squads.json (not derivable from match results alone - league
            # position accounts for real tiebreakers this project doesn't
            # replicate) - overlaid onto the season aggregate row.
            season_entries = []
            for squad_id, stats in season.items():
                team_id = team_ids_by_external.get(squad_id)
                if team_id is None:
                    unresolved += 1
                    continue
                squad = squads_by_external.get(squad_id, {})
                stats["total_points"] = squad.get("totalPoints")
                season_entries.append((team_id, stats))
            written = upsert_club_stats_batch(cur, None, season_entries)
            print(f"Season aggregate: {written} real clubs ({unresolved} unresolved)", flush=True)

            for round_number, bucket in sorted(per_round.items()):
                round_entries = []
                for squad_id, stats in bucket.items():
                    team_id = team_ids_by_external.get(squad_id)
                    if team_id is None:
                        continue
                    round_entries.append((team_id, stats))
                if round_entries:
                    n = upsert_club_stats_batch(cur, round_number, round_entries)
                    print(f"GW{round_number}: {n} real club rows written", flush=True)

        conn.commit()
        print("Done.", flush=True)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    if unresolved:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
