"""
compute_club_projections.py
-----------------------------
Phase 3: the club projection engine - the other half of Fantasy EFL's real
scoring (2 club picks alongside 7 players, see CLAUDE.md "Why this is a
separate project"). No equivalent in dreamteam-projections - genuinely new.

For every club, for each horizon, projects real win/draw/away-win/clean-
sheet/2+/4+-goals probabilities from a standard independent-Poisson
scoreline model (same real math as dreamteam-projections'
import_dreamteamtonic_market_odds.py match_outcome_probs, reused
verbatim), fed by each club's own real season-to-date attack/defense
strength (goals_scored/goals_conceded per real game, shrunk toward the
real self-calibrated league average) rather than live market odds - no
live-odds source exists for Fantasy EFL clubs at all (see
docs/data-and-weights.md). A documented, standard, named home-advantage
constant (not measured from this project's own still-thin sample) is
applied on top - a real, widely-studied football effect.

No Xmins/rating concept for clubs (a club with a real fixture in the
window always "plays" it - there's no "will they feature" question the
way there is for a player) - `club_projections` has no rating column
either (see that table's own migration).

RUN:
    python scripts/compute_club_projections.py
"""

import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

from psycopg2.extras import execute_values

sys.path.insert(0, str(Path(__file__).resolve().parent))
from env_utils import db_connect  # noqa: E402

HORIZONS = (1, 2, 3, 5)
SEASON_DISPLAY = "2026/27"
SHRINKAGE_GAMES = 10.0
RECENT_FORM_DECAY = 0.85
RECENT_FORM_LOOKBACK = 8
RECENT_FORM_K = 3.0
NEUTRAL_FDR = 3.0
LEAGUE_AVG_GOALS_FALLBACK = 1.4  # same documented real-world sanity value as the player engine's own fallback - only used if zero real club_stats rows exist yet.
HOME_ADVANTAGE = 1.15  # a standard, widely-documented real football home-advantage effect (not fitted from this project's own thin early-season sample) - applied to the home side's expected goals only.


def poisson_pmf(k, lam):
    return math.exp(-lam) * (lam**k) / math.factorial(k)


def match_outcome_probs(for_xg, against_xg, max_goals=10):
    """Standard independent-Poisson scoreline model - ported verbatim
    (mechanics) from dreamteam-projections' import_dreamteamtonic_market_
    odds.py. Symmetric in its two arguments' real meaning (not venue-
    specific) - returns (P(for > against), P(for == against), P(for <
    against)), i.e. (win, draw, loss) from the perspective of whichever
    side `for_xg` belongs to."""
    for_pmf = [poisson_pmf(k, for_xg) for k in range(max_goals + 1)]
    against_pmf = [poisson_pmf(k, against_xg) for k in range(max_goals + 1)]
    win = draw = loss = 0.0
    for f in range(max_goals + 1):
        for a in range(max_goals + 1):
            p = for_pmf[f] * against_pmf[a]
            if f > a:
                win += p
            elif f == a:
                draw += p
            else:
                loss += p
    total = win + draw + loss
    return win / total, draw / total, loss / total


def probability_at_least(k, lam):
    """P(X >= k) for X ~ Poisson(lam) - same closed form as
    compute_player_projections.py's own version (duplicated, not
    imported - each script here is independently runnable, same
    convention dreamteam-projections' own scripts already follow)."""
    lam = max(0.0, lam)
    if lam == 0:
        return 0.0
    cumulative = sum(math.exp(-lam) * (lam**i) / math.factorial(i) for i in range(k))
    return max(0.0, 1.0 - cumulative)


def historical_shrunk_rate(games_exposure, raw_total, avg_per_game):
    return (raw_total + SHRINKAGE_GAMES * avg_per_game) / (games_exposure + SHRINKAGE_GAMES)


def fixture_factor_from_fdr(opponent_fdr):
    if opponent_fdr is None or opponent_fdr <= 0:
        return 1.0
    return NEUTRAL_FDR / opponent_fdr


def resolve_opponent_fdr(team_fdr_map, fixture):
    fdr_home, fdr_away = team_fdr_map.get(fixture["opponent_team_id"], (None, None))
    opponent_is_home = not fixture["is_home"]
    fdr = fdr_home if opponent_is_home else fdr_away
    return float(fdr) if fdr is not None else None


def load_club_scoring_rules(cur):
    cur.execute("select stat, points from club_scoring_rules")
    return {stat: float(points) for stat, points in cur.fetchall()}


def points_for(rules, stat):
    return rules.get(stat, 0.0)


def load_club_layer_weights(cur):
    cur.execute("select horizon, layer, weight from club_layer_weights")
    weights = {}
    for horizon, layer, weight in cur.fetchall():
        weights.setdefault(horizon, {})[layer] = float(weight)
    return weights


def resolve_current_gameweek(cur):
    now = datetime.now(timezone.utc)
    cur.execute("select min(gameweek) from fixtures where kickoff_at >= %s", (now,))
    row = cur.fetchone()
    if row and row[0] is not None:
        return row[0]
    cur.execute("select max(gameweek) from fixtures")
    row = cur.fetchone()
    return row[0] if row and row[0] is not None else None


def fetch_window_fixtures(cur, team_id, current_gameweek, horizon):
    end_gw = current_gameweek + horizon - 1
    cur.execute(
        """
        select id, home_team_id, away_team_id, kickoff_at, gameweek
        from fixtures
        where (home_team_id = %s or away_team_id = %s) and gameweek between %s and %s
        order by kickoff_at
        """,
        (team_id, team_id, current_gameweek, end_gw),
    )
    fixtures = []
    for fid, home_id, away_id, kickoff_at, gw in cur.fetchall():
        is_home = home_id == team_id
        fixtures.append({
            "id": fid, "kickoff_at": kickoff_at, "gameweek": gw, "is_home": is_home,
            "opponent_team_id": away_id if is_home else home_id,
        })
    return fixtures


def compute_league_avg_goals(cur):
    """Self-calibrated real average goals scored per real club-game -
    since goals scored league-wide must equal goals conceded league-wide,
    this one real average feeds both attack and defense strength below."""
    cur.execute("select sum(goals_scored), sum(games_played) from club_stats where gameweek is null")
    total_goals, total_games = cur.fetchone()
    if not total_games:
        return LEAGUE_AVG_GOALS_FALLBACK
    return float(total_goals or 0) / float(total_games)


def load_all_club_strength(cur, league_avg_goals):
    """Real shrunk attack (goals scored/game) and defense (goals
    conceded/game) strength per club, from the real season-aggregate
    club_stats row."""
    cur.execute("select team_id, games_played, goals_scored, goals_conceded from club_stats where gameweek is null")
    attack, defense, games_played_map = {}, {}, {}
    for team_id, games_played, goals_scored, goals_conceded in cur.fetchall():
        games_played = games_played or 0
        attack[team_id] = historical_shrunk_rate(games_played, goals_scored or 0, league_avg_goals)
        defense[team_id] = historical_shrunk_rate(games_played, goals_conceded or 0, league_avg_goals)
        games_played_map[team_id] = games_played
    return attack, defense, games_played_map


def load_all_round_results(cur):
    """Every real per-round club result row, for every club at once - the
    real per-round signal compute_club_form_rate needs (unlike the player
    engine, "did this club play this round" is always a plain, knowable
    fact here - games_played per round - so no proxy/approximation is
    needed the way player Form needed one)."""
    cur.execute(
        "select team_id, gameweek, games_played, wins, draws, away_wins, clean_sheets, two_plus_goal_games, four_plus_goal_games "
        "from club_stats where season = %s and gameweek is not null",
        (SEASON_DISPLAY,),
    )
    rows_by_team = {}
    for team_id, gameweek, games_played, wins, draws, away_wins, clean_sheets, two_plus, four_plus in cur.fetchall():
        rows_by_team.setdefault(team_id, {})[gameweek] = {
            "games_played": games_played or 0, "wins": wins or 0, "draws": draws or 0, "away_wins": away_wins or 0,
            "clean_sheets": clean_sheets or 0, "two_plus_goal_games": two_plus or 0, "four_plus_goal_games": four_plus or 0,
        }
    return rows_by_team


def real_round_points(round_stats, club_rules):
    """Real fantasy points a club's real per-round result would have
    scored, priced through the real club_scoring_rules - used only to
    build the Form layer's recency signal, not written anywhere itself."""
    return (
        round_stats["wins"] * points_for(club_rules, "win")
        + round_stats["draws"] * points_for(club_rules, "draw")
        + round_stats["away_wins"] * points_for(club_rules, "away_win")
        + round_stats["clean_sheets"] * points_for(club_rules, "clean_sheet")
        + round_stats["two_plus_goal_games"] * points_for(club_rules, "two_plus_goals")
        + round_stats["four_plus_goal_games"] * points_for(club_rules, "four_plus_goals")
    )


def compute_club_form_rate(round_results, club_rules, current_gameweek, historical_prior):
    """Real recency-decayed club points rate, shrunk toward the season
    prior - same two-step formula as the player engine's Form layer, with
    a real (not proxied) per-round games_played exposure weight."""
    lookback_start = max(1, current_gameweek - RECENT_FORM_LOOKBACK)
    relevant = {gw: rs for gw, rs in round_results.items() if lookback_start <= gw < current_gameweek}
    if not relevant:
        return None
    weighted_value_sum = 0.0
    weighted_games_sum = 0.0
    for gw, rs in relevant.items():
        weight = RECENT_FORM_DECAY ** (current_gameweek - gw - 1)
        weighted_value_sum += weight * real_round_points(rs, club_rules)
        weighted_games_sum += weight * rs["games_played"]
    if weighted_games_sum <= 0:
        return None
    return (weighted_value_sum + RECENT_FORM_K * historical_prior) / (weighted_games_sum + RECENT_FORM_K)


def compute_fixture_xg(own_attack, own_defense, opp_attack, opp_defense, league_avg_goals, is_home):
    """Standard multiplicative attack/defense Poisson model: each side's
    real expected goals = their own real attack strength x the
    opponent's real defense weakness, normalised by the real league
    average - HOME_ADVANTAGE applied to the home side only."""
    if is_home:
        xg_for = HOME_ADVANTAGE * own_attack * opp_defense / league_avg_goals
        xg_against = opp_attack * own_defense / league_avg_goals
    else:
        xg_for = own_attack * opp_defense / league_avg_goals
        xg_against = HOME_ADVANTAGE * opp_attack * own_defense / league_avg_goals
    return xg_for, xg_against


def project_club_stats(team_id, fixtures, attack, defense, league_avg_goals, club_rules):
    win_p_total = draw_p_total = away_win_p_total = cs_p_total = two_p_total = four_p_total = 0.0
    own_attack = attack.get(team_id, league_avg_goals)
    own_defense = defense.get(team_id, league_avg_goals)
    # Real per-fixture breakdown - the Fixture Forecast page (Phase 5)
    # reads this directly rather than recomputing the Poisson model
    # client-side, same "read what the engine produced" principle as the
    # player engine's own per_layer.fixture_quantity.fixtures list.
    fixture_breakdown = []

    for fixture in fixtures:
        opp_id = fixture["opponent_team_id"]
        opp_attack = attack.get(opp_id, league_avg_goals)
        opp_defense = defense.get(opp_id, league_avg_goals)
        xg_for, xg_against = compute_fixture_xg(own_attack, own_defense, opp_attack, opp_defense, league_avg_goals, fixture["is_home"])

        win_p, draw_p, loss_p = match_outcome_probs(xg_for, xg_against)
        cs_p = poisson_pmf(0, xg_against)
        two_p = probability_at_least(2, xg_for)
        four_p = probability_at_least(4, xg_for)

        win_p_total += win_p
        draw_p_total += draw_p
        if not fixture["is_home"]:
            away_win_p_total += win_p
        cs_p_total += cs_p
        two_p_total += two_p
        four_p_total += four_p

        fixture_breakdown.append({
            "gameweek": fixture["gameweek"],
            "opponent_team_id": fixture["opponent_team_id"],
            "is_home": fixture["is_home"],
            "kickoff_at": fixture["kickoff_at"].isoformat(),
            "win_prob": round(win_p, 3),
            "draw_prob": round(draw_p, 3),
            "loss_prob": round(loss_p, 3),
            "clean_sheet_prob": round(cs_p, 3),
            "two_plus_goals_prob": round(two_p, 3),
            "expected_goals_for": round(xg_for, 3),
            "expected_goals_against": round(xg_against, 3),
        })

    # "expected_count" not "probability" - a real double gameweek sums
    # each fixture's own real probability, so this can legitimately
    # exceed 1.0 (e.g. two fixtures each with a 60% win chance -> an
    # expected 1.2 wins that gameweek, priced accordingly) - same summed-
    # across-fixtures convention already used for every player stat.
    per_stat = {
        "win": {"expected_count": round(win_p_total, 3), "points": round(win_p_total * points_for(club_rules, "win"), 2)},
        "draw": {"expected_count": round(draw_p_total, 3), "points": round(draw_p_total * points_for(club_rules, "draw"), 2)},
        "away_win": {"expected_count": round(away_win_p_total, 3), "points": round(away_win_p_total * points_for(club_rules, "away_win"), 2)},
        "clean_sheet": {"expected_count": round(cs_p_total, 3), "points": round(cs_p_total * points_for(club_rules, "clean_sheet"), 2)},
        "two_plus_goals": {"expected_count": round(two_p_total, 3), "points": round(two_p_total * points_for(club_rules, "two_plus_goals"), 2)},
        "four_plus_goals": {"expected_count": round(four_p_total, 3), "points": round(four_p_total * points_for(club_rules, "four_plus_goals"), 2)},
        "fixtures": fixture_breakdown,
    }
    total_points = sum(v["points"] for v in per_stat.values() if isinstance(v, dict) and "points" in v)
    return per_stat, total_points


def project_club_layers(horizon, fixtures, team_fdr_map, team_names, form_raw, weights):
    fixture_quantity_raw = len(fixtures) / horizon if horizon else None

    fixture_list = []
    quality_scores = []
    for f in fixtures:
        opponent_fdr = resolve_opponent_fdr(team_fdr_map, f)
        if opponent_fdr is not None:
            quality_scores.append(fixture_factor_from_fdr(opponent_fdr))
        fixture_list.append({
            "opponent": team_names.get(f["opponent_team_id"], "?"),
            "is_home": f["is_home"],
            "kickoff_at": f["kickoff_at"].isoformat(),
            "gameweek": f["gameweek"],
            "opponent_fdr": opponent_fdr,
        })
    fixture_quality_raw = sum(quality_scores) / len(quality_scores) if quality_scores else None

    return {
        "form": {"value": round(form_raw, 3) if form_raw is not None else None, "populated": form_raw is not None, "weight": weights.get("form")},
        "fixture_quantity": {"value": round(fixture_quantity_raw, 3) if fixture_quantity_raw is not None else None,
                              "populated": fixture_quantity_raw is not None, "weight": weights.get("fixture_quantity"), "fixtures": fixture_list},
        "fixture_quality": {"value": round(fixture_quality_raw, 3) if fixture_quality_raw is not None else None,
                             "populated": fixture_quality_raw is not None, "weight": weights.get("fixture_quality")},
        "live_odds": {"value": None, "populated": False, "weight": weights.get("live_odds")},
    }


def main():
    conn = db_connect()
    conn.autocommit = False
    cur = conn.cursor()
    try:
        current_gameweek = resolve_current_gameweek(cur)
        if current_gameweek is None:
            raise SystemExit("No real fixtures with a gameweek found - run scrape_fixtures.py first.")
        print(f"Current gameweek: {current_gameweek}")

        club_rules = load_club_scoring_rules(cur)
        layer_weights = load_club_layer_weights(cur)
        league_avg_goals = compute_league_avg_goals(cur)
        print(f"League-average goals per game (self-calibrated): {round(league_avg_goals, 3)}")
        attack, defense, games_played_map = load_all_club_strength(cur, league_avg_goals)
        round_results_map = load_all_round_results(cur)

        cur.execute("select id, fdr_home, fdr_away from teams")
        team_fdr_map = {team_id: (fdr_home, fdr_away) for team_id, fdr_home, fdr_away in cur.fetchall()}
        cur.execute("select id, name from teams")
        team_names = dict(cur.fetchall())
        cur.execute("select id from teams")
        team_ids = [row[0] for row in cur.fetchall()]

        cur.execute("select coalesce(max(revision), 0) + 1 from algorithm_versions")
        revision = cur.fetchone()[0]
        cur.execute(
            "insert into algorithm_versions (revision, weights, created_by, note) values (%s, %s, %s, %s) returning id",
            (revision, json.dumps({"club_layer_weights": layer_weights, "club_scoring_rules": club_rules}), "compute_club_projections.py", f"Auto-generated club run for gameweek {current_gameweek}"),
        )
        algorithm_version_id = cur.fetchone()[0]

        window_fixtures_cache = {
            (team_id, horizon): fetch_window_fixtures(cur, team_id, current_gameweek, horizon)
            for team_id in team_ids
            for horizon in HORIZONS
        }

        rows = []
        no_fixtures = 0
        cur.execute(
            "select team_id, wins, draws, away_wins, clean_sheets, two_plus_goal_games, four_plus_goal_games "
            "from club_stats where gameweek is null"
        )
        season_result_rows = {
            row[0]: dict(zip(["wins", "draws", "away_wins", "clean_sheets", "two_plus_goal_games", "four_plus_goal_games"], row[1:]))
            for row in cur.fetchall()
        }

        for team_id in team_ids:
            games_exposure = games_played_map.get(team_id, 0)
            # Real season-wide points-per-game (from real season-aggregate
            # results, priced through club_scoring_rules) - the shrinkage
            # prior compute_club_form_rate needs for a club with a thin
            # real recent sample.
            historical_prior = 0.0
            season_stats = season_result_rows.get(team_id)
            if season_stats and games_exposure > 0:
                historical_prior = real_round_points(season_stats, club_rules) / games_exposure

            form_raw = compute_club_form_rate(round_results_map.get(team_id, {}), club_rules, current_gameweek, historical_prior)

            for horizon in HORIZONS:
                fixtures = window_fixtures_cache.get((team_id, horizon), [])
                if not fixtures:
                    no_fixtures += 1
                    continue
                per_stat, total_points = project_club_stats(team_id, fixtures, attack, defense, league_avg_goals, club_rules)
                per_layer = project_club_layers(horizon, fixtures, team_fdr_map, team_names, form_raw, layer_weights.get(horizon, {}))
                rows.append((team_id, current_gameweek, horizon, algorithm_version_id, round(total_points, 2), json.dumps(per_stat), json.dumps(per_layer)))

        execute_values(
            cur,
            """
            insert into club_projections (team_id, gameweek, horizon, algorithm_version_id, total_points, per_stat, per_layer)
            values %s
            on conflict (team_id, gameweek, horizon, algorithm_version_id) do update
                set total_points = excluded.total_points, per_stat = excluded.per_stat, per_layer = excluded.per_layer
            """,
            rows,
        )

        conn.commit()
        print(f"\nDone: {len(rows)} club projections written (algorithm_version_id={algorithm_version_id}, revision={revision}).")
        print(f"{no_fixtures} club-horizon combinations skipped - no real fixture in that window yet (a genuine blank).")
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
