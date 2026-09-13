"""
scrape_player_stats.py
-----------------------
Real per-player stats from fantasy.efl.com's own free, unauthenticated JSON.

Real pivot 2026-09-13 (see CLAUDE.md Status and docs/data-and-weights.md):
found live that json/fantasy/live_scores/{roundNumber}.json is ALSO fully
public (no login needed, confirmed by fetching it from a fresh, unauthenticated
browser session) and gives a genuine per-player, per-MATCH breakdown for
EVERY real player who played that round - not just ones with a scoring event
(unlike rounds.json's events array, the previous per-round source) - including
real minutesPlayed and real penaltySaves, neither of which any previously-used
source provided anywhere. This replaces rounds.json-derived per-round event
totals as the per-round source entirely; rounds.json is still used elsewhere
(scrape_fixtures.py, scrape_club_stats.py) for real match results, just not
here anymore.

Two real sources, two different real jobs:
  - players.json: real season-aggregate identity (name/team/position/
    ownership/status/injury) - written as the gameweek=null row's identity
    columns. Its own aggregate stat fields (goalsScored/assists/etc) are no
    longer used for the season row's STATS - see below, those are now
    summed from live_scores instead, for one consistent real source instead
    of two that could drift apart.
  - live_scores/{round}.json: real per-player, per-match totals - goals,
    assists, keyPasses, shotsOnTarget, cleanSheet, clearances, blocks,
    tackles, interceptions, saves, goalsConceded, yellowCards, redCards,
    ownGoals, penaltyMisses, penaltySaves, minutesPlayed, and the real
    official `points` total for that match - written per real round, AND
    summed into the season-aggregate row (so the aggregate is now a genuine
    sum of every real round captured, not a second, independently-sourced
    number that could disagree with the per-round rows).

This one real pivot closes several real gaps this project has carried since
Phase 2 (see docs/data-and-weights.md "Known limitations" - now mostly
resolved):
  - Real per-match minutes finally exist (`minutesPlayed`) - Xmins no longer
    needs the season-wide games_played proxy (see
    compute_player_projections.py's compute_base_xmins_fraction).
  - `missed_penalty` is now a REAL per-player field (`penaltyMisses`) -
    no more inferring it from a same-minute-Goal absence on a Penalty event.
  - `penalty_save` can finally be priced (migration 0019's new
    `penalty_saves` column) - genuinely no free source had this before.
  - Every real player who appeared gets a real per-round row, not just
    scorers/carded players - a quiet 90-minute defensive shift is now
    visible, not indistinguishable from not playing at all.

No real per-player goalsConceded field existed anywhere before this pivot
(only a per-club one) - live_scores now gives a real PER-PLAYER
goalsConceded too, stored on player_stats for completeness/player-page
display, but compute_player_projections.py's goals_conceded_per_2 pricing
deliberately keeps using the player's own TEAM's real defensive record
(conceding is a team outcome a GK/DEF simply inherits by being on the pitch,
not an individual rate worth its own shrinkage) - unchanged by this pivot.

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
TOTAL_REAL_GAMEWEEKS = 42  # real total including playoffs, per fefl/current-gameweek's own totalGameweeksWithPlayoffs (see original Phase 0 research) - the live_scores loop below tries every real round number and simply gets an empty list back for one that hasn't been played yet, so this is just an upper bound, not a guess about how far the season has actually progressed.

# live_scores field -> player_stats column. Every one of these is either a
# real stat Fantasy EFL's own scoring rules (migration 0005) price directly,
# or (minutes_played, penalty_saves - migration 0019) newly priceable
# because of this real pivot.
FIELD_TO_COLUMN = {
    "minutesPlayed": "minutes_played",
    "goalsScored": "goals",
    "assists": "assists",
    "keyPasses": "key_passes",
    "shotsOnTarget": "shots_on_target",
    "cleanSheet": "clean_sheets",
    "clearances": "clearances",
    "blocks": "blocks",
    "tackles": "tackles",
    "interceptions": "interceptions",
    "saves": "saves",
    "goalsConceded": "goals_conceded",
    "yellowCards": "yellow_cards",
    "redCards": "red_cards",
    "ownGoals": "own_goals",
    "penaltyMisses": "missed_penalties",
    "penaltySaves": "penalty_saves",
    "points": "total_points",
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


def build_round_totals(round_number):
    """Real per-(player) totals for one real round, from live_scores' own
    real per-match rows - summed across every real row for that player (a
    double gameweek genuinely gives more than one real match in the same
    round, and Fantasy EFL's own real rules score every one of them, not an
    average - see project_stats' own docstring for the same real rule
    already applied to future-fixture projections). Returns {} for a round
    that hasn't been played yet (live_scores returns a real, empty list -
    not an error - for those, confirmed live)."""
    data = fetch_json(f"live_scores/{round_number}.json")
    totals = {}
    for row in data.get("players", []):
        player_key = str(row["playerId"])
        bucket = totals.setdefault(player_key, {col: 0 for col in FIELD_TO_COLUMN.values()})
        for field, col in FIELD_TO_COLUMN.items():
            bucket[col] += row.get(field) or 0
    return totals


def upsert_player_stats_batch(cur, gameweek, entries):
    """entries: list of (player_id, stat_dict) where stat_dict keys are
    real player_stats columns. Every row in one call shares the same
    gameweek, so one conflict target covers the batch (see migration
    0003's two real unique constraints)."""
    all_columns = sorted(set(FIELD_TO_COLUMN.values()) | {"games_played"})
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

            # Real per-round rows, straight from live_scores - every real
            # played round gets a real row for every real player who
            # featured (see module docstring for why this is a genuine
            # improvement over the old events-only per-round source).
            # Season aggregate accumulates alongside, as a genuine running
            # sum of every real round captured this loop - not a second,
            # independently-sourced number (see module docstring).
            season_totals = {}
            unresolved_players = set()
            rounds_with_data = 0
            for round_number in range(1, TOTAL_REAL_GAMEWEEKS + 1):
                round_totals = build_round_totals(round_number)
                if not round_totals:
                    continue
                rounds_with_data += 1

                round_entries = []
                for player_key, stats in round_totals.items():
                    player_id = players_by_external.get(player_key)
                    if player_id is None:
                        unresolved_players.add(player_key)
                        continue
                    stats_with_flag = dict(stats)
                    stats_with_flag["games_played"] = 1 if stats["minutes_played"] > 0 else 0
                    round_entries.append((player_id, stats_with_flag))

                    season_bucket = season_totals.setdefault(player_id, {col: 0 for col in FIELD_TO_COLUMN.values()})
                    season_bucket["games_played"] = season_bucket.get("games_played", 0) + stats_with_flag["games_played"]
                    for col in FIELD_TO_COLUMN.values():
                        season_bucket[col] += stats[col]

                if round_entries:
                    n = upsert_player_stats_batch(cur, round_number, round_entries)
                    print(f"GW{round_number}: {n} real per-match player rows written", flush=True)

            print(f"{rounds_with_data} real rounds had live_scores data.", flush=True)

            # Season-aggregate row: a genuine sum of every real round
            # captured above - one for every real active player, even a
            # genuine zero (never featured this season yet) rather than a
            # missing row, so downstream code that expects every active
            # player to have a season_stats row keeps working unchanged.
            blank_season = {col: 0 for col in FIELD_TO_COLUMN.values()}
            season_entries = [
                (player_id, season_totals.get(player_id, blank_season))
                for player_id in players_by_external.values()
            ]
            written = upsert_player_stats_batch(cur, None, season_entries)
            print(f"Season aggregate: {written} real players (summed from {rounds_with_data} real rounds)", flush=True)

            if unresolved_players:
                log_event(cur, "player_event_unresolved", f"{len(unresolved_players)} real live_scores playerIds had no matching player", details={"playerIds": list(unresolved_players)[:20]})
                print(f"Warning: {len(unresolved_players)} real live_scores playerIds had no matching player.", flush=True)

        conn.commit()
        print("Done.", flush=True)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
