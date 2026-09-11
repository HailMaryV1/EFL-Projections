"""
scrape_player_stats.py
-----------------------
Real per-player stats from DreamTeamTonic's fefl/overall-stats-by-gw -
confirmed live this session that fromGW/toGW genuinely scope (a single-
gameweek call differs correctly from a season-long aggregate), so no repeat
of dreamteam-projections' earlier "believed the params were ignored"
mistake.

Pulls one season-aggregate call (fromGW=1..totalGameweeks) - used to upsert
`players`' identity fields, so every real active player gets a row even in
a week they didn't feature - plus one call per played gameweek so far, each
upserting that gameweek's `player_stats` row.

Every upsert is BATCHED with psycopg2.extras.execute_values (one round trip
per ~3570-player response, not one per player) - dreamteam-projections
documents a real CI incident where a per-row query loop over a similarly-
sized player pool took 37+ minutes and blew a GitHub Actions timeout;
batching from day one here instead of hitting that same wall first.

No raw minutes-played field exists anywhere in this response (see
docs/data-and-weights.md "Known limitations") - not fabricated here, simply
not stored.

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

BASE = "https://dtt-data-api-259295136071.europe-west2.run.app/fefl"
SEASON = "202627"
SEASON_DISPLAY = "2026/27"

# Real API field -> player_stats column. Every one of these is a stat
# Fantasy EFL's real scoring rules (migration 0005) price directly - see
# docs/data-and-weights.md "Scoring model".
FIELD_TO_COLUMN = {
    "gamesPlayed": "games_played",
    "goals": "goals",
    "assists": "assists",
    "keyPasses": "key_passes",
    "shotsOnTarget": "shots_on_target",
    "cleanSheets": "clean_sheets",
    "clearances": "clearances",
    "blocks": "blocks",
    "tackles": "tackles",
    "interceptions": "interceptions",
    "saves": "saves",
    "goalsConceded": "goals_conceded",
}


def fetch_current_gameweek():
    r = requests.get(f"{BASE}/current-gameweek", params={"season": SEASON}, timeout=30)
    r.raise_for_status()
    return r.json()


def fetch_stats(from_gw, to_gw):
    r = requests.get(f"{BASE}/overall-stats-by-gw", params={"fromGW": from_gw, "toGW": to_gw, "season": SEASON}, timeout=60)
    r.raise_for_status()
    return r.json()["players"]


def upsert_players_batch(cur, players, team_ids_by_external):
    rows = []
    for p in players:
        team_id = team_ids_by_external.get(str(p["squadId"]))
        full_name = f"{p.get('firstName', '')} {p.get('lastName', '')}".strip() or p.get("displayName", "Unknown")
        rows.append((
            str(p["playerId"]), full_name, p.get("firstName"), p.get("lastName"), team_id,
            p.get("position"), p.get("percentSelected"), p.get("status"),
            p.get("injuryStatus"), p.get("injuryType"), p.get("suspensionDetail"),
        ))
    result = execute_values(
        cur,
        """
        insert into players (external_id, full_name, first_name, last_name, team_id, position, ownership_pct, status, injury_status, injury_type, suspension_detail)
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
          injury_type = excluded.injury_type,
          suspension_detail = excluded.suspension_detail,
          updated_at = now()
        returning external_id, id
        """,
        rows,
        fetch=True,
    )
    return dict(result)


def upsert_player_stats_batch(cur, gameweek, players, players_by_external):
    stat_columns = list(FIELD_TO_COLUMN.values())
    columns = ["player_id", "season", "gameweek", "total_points"] + stat_columns
    rows = []
    skipped = 0
    for p in players:
        player_id = players_by_external.get(str(p["playerId"]))
        if player_id is None:
            skipped += 1
            continue
        rows.append((player_id, SEASON_DISPLAY, gameweek, p.get("totalPoints")) + tuple(p.get(f) for f in FIELD_TO_COLUMN))
    if not rows:
        return 0, skipped

    update_cols = [c for c in columns if c not in ("player_id", "season", "gameweek")]
    update_clause = ", ".join(f"{c} = excluded.{c}" for c in update_cols)
    # Partial-unique-index conflict target for the season-aggregate rows
    # (gameweek is null), the plain 3-column one otherwise - matches
    # migration 0003's two real unique constraints. Every row in one call
    # shares the same gameweek (fetch_stats is always called for one
    # gameweek value at a time), so one conflict target covers the batch.
    conflict_target = "(player_id, season) where gameweek is null" if gameweek is None else "(player_id, season, gameweek)"
    execute_values(
        cur,
        f"insert into player_stats ({', '.join(columns)}) values %s on conflict {conflict_target} do update set {update_clause}",
        rows,
    )
    return len(rows), skipped


def main():
    conn = db_connect()
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            cur.execute("select external_id, id from teams")
            team_ids_by_external = dict(cur.fetchall())

            current = fetch_current_gameweek()
            current_gw = current["currentGameweek"]
            total_gws = current["totalGameweeks"]
            print(f"Real current gameweek: {current_gw} of {total_gws}", flush=True)

            # Season aggregate first - this is what seeds player identity.
            season_players = fetch_stats(1, total_gws)
            players_by_external = upsert_players_batch(cur, season_players, team_ids_by_external)
            written, _ = upsert_player_stats_batch(cur, None, season_players, players_by_external)
            print(f"Season aggregate: {written} real players", flush=True)

            # Per-gameweek rows for every gameweek that's kicked off so far
            # (including the current one, which may be partway through -
            # a not-yet-played fixture in it just contributes zeros, same
            # as DreamTeamTonic's own real aggregate does, and gets refreshed
            # on the next run).
            for gw in range(1, current_gw + 1):
                gw_players = fetch_stats(gw, gw)
                written, skipped = upsert_player_stats_batch(cur, gw, gw_players, players_by_external)
                print(f"GW{gw}: {written} real player rows written" + (f", {skipped} skipped (not in season aggregate)" if skipped else ""), flush=True)

            unresolved_teams = {p["squadId"] for p in season_players if str(p["squadId"]) not in team_ids_by_external and p.get("squadId")}
            if unresolved_teams:
                log_event(cur, "player_team_unresolved", f"{len(unresolved_teams)} real squadIds had no matching team", details={"squadIds": list(unresolved_teams)[:20]})
                print(f"Warning: {len(unresolved_teams)} real squadIds had no matching team - run seed_teams.py first if this is unexpected.", flush=True)

        conn.commit()
        print("Done.", flush=True)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
