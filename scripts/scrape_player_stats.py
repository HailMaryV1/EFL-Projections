"""
scrape_player_stats.py
-----------------------
Real per-player stats from fantasy.efl.com's own free, unauthenticated
JSON - real pivot 2026-09 (see CLAUDE.md Status): DreamTeamTonic's own
free stats mirror turned out to return genuine zeros for every per-event
stat across all 3570 real players (confirmed live against the raw API,
not a scraper bug) - the official site's own json/fantasy/players.json
and json/fantasy/rounds.json have the real data instead.

Two real sources, two different real jobs:
  - players.json: real season-aggregate identity + stats per player
    (goalsScored, assists, keyPasses, shotsOnTarget, cleanSheets,
    clearances, blocks, tackles, interceptions, saves, appearances,
    totalPoints) - written as the gameweek=null row.
  - rounds.json: real match EVENTS (Goal/YellowCard/RedCard/OwnGoal/
    Penalty, each with playerId/minute/assistPlayerId) - the only real
    source for a per-ROUND breakdown, and for 4 stats no aggregate field
    covers at all: yellow cards, red cards, own goals, and missed
    penalties (a real "Penalty" event with no same-minute "Goal" for the
    same player - confirmed live: 0 of 35 real Penalty events this season
    have a matching Goal, supporting "missed" over "scored").

No real per-player goalsConceded field exists anywhere (only a per-club
one, via scrape_club_stats.py) - GK/DEF's goals_conceded_per_2 is priced
from the player's own TEAM's real defensive record instead, computed in
compute_player_projections.py. No real penalty-save attribution exists
either (the Penalty event only carries the taker's id, not a saving
keeper's) - that one stat stays genuinely unpriced.

RUN:
    python scripts/scrape_player_stats.py
"""

import sys
from pathlib import Path

import requests
from psycopg2.extras import execute_values

sys.path.insert(0, str(Path(__file__).resolve().parent))
from env_utils import db_connect
from activity_log import log_event

BASE = "https://fantasy.efl.com/json/fantasy"
SEASON_DISPLAY = "2026/27"

# players.json field -> player_stats column. Every one of these is a real
# stat Fantasy EFL's real scoring rules (migration 0005) price directly.
FIELD_TO_COLUMN = {
    "goalsScored": "goals",
    "assists": "assists",
    "keyPasses": "key_passes",
    "shotsOnTarget": "shots_on_target",
    "cleanSheets": "clean_sheets",
    "clearances": "clearances",
    "blocks": "blocks",
    "tackles": "tackles",
    "interceptions": "interceptions",
    "saves": "saves",
    "appearances": "games_played",
}

# rounds.json event type -> player_stats column, keyed by the taker/scorer
# (playerId). "Penalty" -> missed_penalties, see module docstring for the
# real evidence behind that mapping.
EVENT_TYPE_TO_COLUMN = {
    "YellowCard": "yellow_cards",
    "RedCard": "red_cards",
    "OwnGoal": "own_goals",
    "Penalty": "missed_penalties",
}


def fetch_json(path):
    r = requests.get(f"{BASE}/{path}", timeout=60)
    r.raise_for_status()
    return r.json()


def upsert_players_batch(cur, players, team_ids_by_external):
    rows = []
    for p in players:
        team_id = team_ids_by_external.get(str(p["squadId"]))
        full_name = f"{p.get('firstName', '')} {p.get('lastName', '')}".strip() or p.get("displayName", "Unknown")
        injury_status = str(p["injuryDetails"]) if p.get("injuryDetails") else None
        suspension_detail = str(p["suspensionDetails"]) if p.get("suspensionDetails") else None
        rows.append((
            str(p["id"]), full_name, p.get("firstName"), p.get("lastName"), team_id,
            p.get("position"), p.get("percentSelected"), p.get("status"), injury_status, suspension_detail,
        ))
    result = execute_values(
        cur,
        """
        insert into players (external_id, full_name, first_name, last_name, team_id, position, ownership_pct, status, injury_status, suspension_detail)
        values %s
        on conflict (external_id) do update set
          full_name = excluded.full_name,
          first_name = excluded.first_name,
          last_name = excluded.last_name,
          team_id = excluded.team_id,
          position = excluded.position,
          ownership_pct = excluded.ownership_pct,
          status = excluded.status,
          injury_status = excluded.injury_status,
          suspension_detail = excluded.suspension_detail,
          updated_at = now()
        returning external_id, id
        """,
        rows,
        fetch=True,
    )
    return dict(result)


def build_round_event_totals(rounds):
    """Real per-(round, player) event counts, aggregated from every real
    match event across every real game. Returns
    {round_number: {player_id_external: {column: count}}} for the 4
    event-derived stats, plus goals/assists (also derivable this way -
    used for the Form layer's real recency signal, see
    compute_player_projections.py)."""
    totals = {}
    for round_ in rounds:
        round_number = round_["roundNumber"]
        bucket = totals.setdefault(round_number, {})
        for game in round_.get("games", []):
            for event in game.get("events", []):
                player_key = str(event["playerId"])
                player_bucket = bucket.setdefault(player_key, {})
                if event["type"] == "Goal":
                    player_bucket["goals"] = player_bucket.get("goals", 0) + 1
                    assist_id = event.get("assistPlayerId")
                    if assist_id:
                        assist_bucket = bucket.setdefault(str(assist_id), {})
                        assist_bucket["assists"] = assist_bucket.get("assists", 0) + 1
                elif event["type"] in EVENT_TYPE_TO_COLUMN:
                    col = EVENT_TYPE_TO_COLUMN[event["type"]]
                    player_bucket[col] = player_bucket.get(col, 0) + 1
    return totals


def build_season_event_totals(round_event_totals):
    """Real season-to-date sums of the 4 event-derived stats (cards/own
    goals/missed penalties) - players.json has no aggregate field for any
    of them, so this is the only real source for the season-aggregate row
    too, not just per-round."""
    season = {}
    for round_bucket in round_event_totals.values():
        for player_key, stats in round_bucket.items():
            season_bucket = season.setdefault(player_key, {})
            for col in EVENT_TYPE_TO_COLUMN.values():
                if col in stats:
                    season_bucket[col] = season_bucket.get(col, 0) + stats[col]
    return season


def upsert_player_stats_batch(cur, gameweek, entries):
    """entries: list of (player_id, stat_dict) where stat_dict keys are
    real player_stats columns. Every row in one call shares the same
    gameweek, so one conflict target covers the batch (see migration
    0003's two real unique constraints)."""
    all_columns = sorted(set(FIELD_TO_COLUMN.values()) | set(EVENT_TYPE_TO_COLUMN.values()) | {"total_points"})
    columns = ["player_id", "season", "gameweek"] + all_columns
    rows = []
    for player_id, stats in entries:
        rows.append((player_id, SEASON_DISPLAY, gameweek) + tuple(stats.get(c) for c in all_columns))
    if not rows:
        return 0

    update_cols = [c for c in columns if c not in ("player_id", "season", "gameweek")]
    update_clause = ", ".join(f"{c} = excluded.{c}" for c in update_cols)
    conflict_target = "(player_id, season) where gameweek is null" if gameweek is None else "(player_id, season, gameweek)"
    execute_values(
        cur,
        f"insert into player_stats ({', '.join(columns)}) values %s on conflict {conflict_target} do update set {update_clause}",
        rows,
    )
    return len(rows)


def main():
    conn = db_connect()
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            cur.execute("select external_id, id from teams")
            team_ids_by_external = dict(cur.fetchall())

            players = fetch_json("players.json")
            players_by_external = upsert_players_batch(cur, players, team_ids_by_external)
            print(f"{len(players)} real players upserted.", flush=True)

            rounds = fetch_json("rounds.json")
            round_event_totals = build_round_event_totals(rounds)
            season_event_totals = build_season_event_totals(round_event_totals)

            # Season-aggregate row: players.json's own real cumulative
            # stats, plus the 4 event-derived ones no aggregate field
            # covers (see module docstring).
            season_entries = []
            for p in players:
                player_id = players_by_external.get(str(p["id"]))
                if player_id is None:
                    continue
                stats = {col: p.get(field) for field, col in FIELD_TO_COLUMN.items()}
                stats["total_points"] = p.get("totalPoints")
                stats.update(season_event_totals.get(str(p["id"]), {}))
                season_entries.append((player_id, stats))
            written = upsert_player_stats_batch(cur, None, season_entries)
            print(f"Season aggregate: {written} real players", flush=True)

            # Real per-round rows - goals/assists/cards/own-goals/missed-
            # penalties only (the only stats a real match event can give a
            # per-round breakdown for - see module docstring for why the
            # continuous defensive stats stay season-aggregate-only).
            unresolved_players = set()
            for round_number, bucket in sorted(round_event_totals.items()):
                round_entries = []
                for player_key, stats in bucket.items():
                    player_id = players_by_external.get(player_key)
                    if player_id is None:
                        unresolved_players.add(player_key)
                        continue
                    round_entries.append((player_id, stats))
                if round_entries:
                    n = upsert_player_stats_batch(cur, round_number, round_entries)
                    print(f"GW{round_number}: {n} real player-event rows written", flush=True)

            if unresolved_players:
                log_event(cur, "player_event_unresolved", f"{len(unresolved_players)} real event playerIds had no matching player", details={"playerIds": list(unresolved_players)[:20]})
                print(f"Warning: {len(unresolved_players)} real event playerIds had no matching player (likely eliminated/non-pool players who still touched the ball).", flush=True)

        conn.commit()
        print("Done.", flush=True)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
