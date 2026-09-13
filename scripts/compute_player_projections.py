"""
compute_player_projections.py
-------------------------------
Phase 3: the player projection engine. For every active, positioned player,
for each horizon (1/2/3/5 gameweeks), computes and writes one `projections`
row - same real shape as dreamteam-projections' own compute_projections.py
(total_points / rating / per_stat / per_layer), but genuinely adapted, not
copy-pasted, for a structurally different game and a thinner free data
source. See docs/data-and-weights.md for the full real reasoning; the short
version of every real adaptation:

  - No Bonus-Points-PPM system. Fantasy EFL's real scoring rules already
    price raw counted events (clearances, blocks, tackles, interceptions,
    key passes, shots on target) directly, and DreamTeamTonic's free
    player-stats source already provides exactly those counts - nothing
    synthetic needed.
  - No cup-rotation Xmins. Fantasy EFL doesn't score cup competitions at
    all - every fixture in a horizon window is a real, counted league
    fixture.
  - Xmins is SEASON-WIDE ONLY (games_played / team_games_played), applied
    identically to every fixture in the window - no per-fixture lineup-
    status refinement, because no live lineup source exists for this game
    yet (unlike Dream Team's Spreadex scrape). A real, documented coarser
    signal, not a guess (see "Known limitations").
  - Fixture Quality comes from the real official FDR rating (fefl/squads'
    fdrHome/fdrAway, now on `teams`) instead of live market xG/clean-sheet
    odds - the one real free signal available, since DreamTeamTonic's own
    Fantasy EFL market-odds tool is Premium-gated (Live Odds layer stays
    genuinely unpopulated for now).
  - Two stats (appearance points, hat-trick bonus) are priced through the
    real tiered tables (migration 0006) instead of a flat rate - see
    "expected_appearance_points"/hat-trick handling below for exactly how,
    since neither has a clean per-90-rate shape.
  - Cards, own goals, missed penalties, and penalty saves are NOT priced -
    confirmed live this session that DreamTeamTonic's free player-stats
    endpoint has no raw counts for any of them (only goals/assists/
    keyPasses/shotsOnTarget/cleanSheets/clearances/blocks/tackles/
    interceptions/saves/goalsConceded). A real, documented gap - excluded
    entirely rather than guessed from an outside league-average rate this
    project has no real evidence for.
  - No Monte Carlo simulation (boom_probability/sim_floor/sim_ceiling) in
    this v1 - `projections` has no columns for it (migration 0011
    deliberately cut it from scope, see that file's own comment). Can be
    added later the same way Dream Team's own migration 0020 did.

Pure math genuinely reused verbatim from dreamteam-projections (game-
agnostic already): tiered_lookup, weighted_average, historical_shrunk_rate
(exposure unit changed from minutes/90 to real games_played - see below -
but the shrinkage formula itself is identical), absolute_rating,
xmins_rating_multiplier.

RUN:
    python scripts/compute_player_projections.py
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
SEASON_DISPLAY = "2026/27"  # must match scrape_player_stats.py's own SEASON_DISPLAY

SHRINKAGE_GAMES = 10.0  # same proven constant dreamteam-projections uses for every historical-rate shrinkage - a real, named football-analytics prior (roughly a third of a season), not measured from this project's own still-thin sample.
XMINS_RATING_DISCOUNT_FLOOR = 0.6  # same constant/shape as dreamteam-projections' own rating discount - a starter (xmins >= this) gets no discount, below it the rating ramps toward 0.
RECENT_FORM_DECAY = 0.85
RECENT_FORM_LOOKBACK = 8  # gameweeks
RECENT_FORM_K = 3.0  # shrinkage strength in equivalent games
RECENT_FORM_STATS = ("goal", "assist")  # same two stats dreamteam-projections validated this decay/shrinkage formula against - not blindly extended to every stat here either.

NEUTRAL_FDR = 3.0  # midpoint of the real official 1-5 FDR scale - "an average opponent."

POSITION_WEIGHTS = {
    "GK": {"attack": 0.0, "clean_sheet": 1.0},
    "DEF": {"attack": 0.3, "clean_sheet": 0.7},
    "MID": {"attack": 0.7, "clean_sheet": 0.3},
    "FWD": {"attack": 1.0, "clean_sheet": 0.0},
}

# scoring_rules.stat -> the real player_stats column its historical rate is
# shrunk from. Real pivot 2026-09 (see CLAUDE.md Status): once the
# pipeline moved onto fantasy.efl.com's own JSON, real per-player counts
# exist for cards/own-goals/missed-penalties too (derived from real match
# events - see scrape_player_stats.py), so those are no longer excluded.
# goals_conceded_per_2 is still NOT here - no real per-PLAYER goals-
# conceded field exists anywhere (only a per-club one) - it's priced from
# the player's own team's real defensive record instead, as a dedicated
# step in project_stats. penalty_save also stays unpriced - the real
# Penalty event only carries the taker's id, never a saving keeper's.
# appearance/hat_trick_bonus have no source column either - priced via the
# real tiered tables instead (see project_stats).
#
# Real pivot 2026-09-13 (see scrape_player_stats.py's own docstring):
# fantasy.efl.com's live_scores/{round}.json gives a real per-player
# penaltySaves count (previously genuinely unpriceable - no free source had
# it) - penalty_save is now priced like every other counted stat.
STAT_COLUMNS = {
    "goal": "goals",
    "assist": "assists",
    "key_pass": "key_passes",
    "shot_on_target": "shots_on_target",
    "tackle": "tackles",
    "clearance": "clearances",
    "block": "blocks",
    "interception": "interceptions",
    "save": "saves",
    "penalty_save": "penalty_saves",
    "clean_sheet_60min": "clean_sheets",
    "yellow_card": "yellow_cards",
    "red_card": "red_cards",
    "own_goal": "own_goals",
    "missed_penalty": "missed_penalties",
}

# How a fixture's real opponent-FDR adjusts each stat's expected count.
# "attack"/"clean_sheet" both scale down against a harder (higher-FDR)
# opponent; "pressure" scales UP (more defensive actions expected against
# a stronger attacking side). "flat" = no real fixture signal predicts
# card/own-goal/missed-penalty risk, same convention dreamteam-projections
# already uses for its own card/penalty-miss rows.
STAT_FIXTURE_MODE = {
    "goal": "attack", "assist": "attack", "shot_on_target": "attack", "key_pass": "attack",
    "clean_sheet_60min": "clean_sheet",
    "save": "pressure", "penalty_save": "pressure", "tackle": "pressure", "clearance": "pressure", "block": "pressure", "interception": "pressure",
    "yellow_card": "flat", "red_card": "flat", "own_goal": "flat", "missed_penalty": "flat",
}

LEAGUE_AVG_GOALS_CONCEDED_FALLBACK = 1.4  # a documented real-world football sanity value (roughly the long-run EFL/EPL average goals per team per match), used only until compute_league_avg_goals_conceded has any real club_stats rows to self-calibrate from.


def tiered_lookup(value, tiers):
    """The highest tier whose threshold `value` meets or exceeds. Ported
    verbatim from dreamteam-projections - pure, game-agnostic."""
    result = 0.0
    for threshold, tier_value in tiers:
        if value >= threshold:
            result = tier_value
    return result


def weighted_average(values, weights):
    """Renormalizes over whichever keys have a real (non-None) value.
    Ported verbatim from dreamteam-projections."""
    available = {k: v for k, v in values.items() if v is not None}
    if not available:
        return None, {}
    total_weight = sum(weights.get(k, 0.0) for k in available)
    if total_weight <= 0:
        n = len(available)
        effective = {k: 1.0 / n for k in available}
    else:
        effective = {k: weights.get(k, 0.0) / total_weight for k in available}
    return sum(effective[k] * available[k] for k in available), effective


def historical_shrunk_rate(games_exposure, raw_total, position_avg_per_game):
    """Same shrinkage formula dreamteam-projections uses, with one real
    adaptation: the exposure unit is real games_played (an integer count
    DreamTeamTonic's own API gives directly), not minutes_played/90 - this
    project has no raw minutes at all (see "Known limitations"), and
    games_played is arguably the more natural unit anyway for stats that
    are themselves per-game counts, not per-minute rates."""
    return (raw_total + SHRINKAGE_GAMES * position_avg_per_game) / (games_exposure + SHRINKAGE_GAMES)


def absolute_rating(raw_value, anchors):
    """Piecewise-linear interpolation between real (raw_value, rating)
    control points - clamps at the ends, never extrapolates. Ported
    verbatim from dreamteam-projections."""
    if raw_value is None or not anchors:
        return None
    pts = sorted(anchors)
    if raw_value <= pts[0][0]:
        return pts[0][1]
    if raw_value >= pts[-1][0]:
        return pts[-1][1]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if x0 <= raw_value <= x1:
            frac = (raw_value - x0) / (x1 - x0) if x1 != x0 else 0.0
            return round(y0 + frac * (y1 - y0))
    return pts[-1][1]


def xmins_rating_multiplier(xmins_fraction):
    """Same real fix dreamteam-projections' own version documents: the
    other four layers describe the TEAM's real situation, not whether THIS
    player will actually be on the pitch for it - a starter gets no
    discount, a fringe player's rating ramps down toward 0, and genuinely
    zero real appearance evidence gets the full discount (never "no
    discount by default")."""
    if xmins_fraction is None:
        return 0.0
    return min(1.0, xmins_fraction / XMINS_RATING_DISCOUNT_FLOOR)


def probability_at_least(k, lam):
    """P(X >= k) for X ~ Poisson(lam), closed form via the regularized
    lower incomplete gamma relationship (sum of the first k-1 terms of the
    Poisson pmf, subtracted from 1) - used for the real hat-trick bonus
    (k=3), the same style of closed-form Poisson tail already established
    in this product family (see lib/matchProbabilities.ts's
    probabilityTwoPlusGoals on the frontend side)."""
    lam = max(0.0, lam)
    if lam == 0:
        return 0.0
    cumulative = sum(math.exp(-lam) * (lam**i) / math.factorial(i) for i in range(k))
    return max(0.0, 1.0 - cumulative)


def fixture_factor_from_fdr(mode, opponent_fdr):
    """Real Fixture Quality adjustment from the official FDR rating (1-5,
    higher = harder) instead of live market xG - see module docstring for
    why. A fixture with no real FDR value (shouldn't happen once
    seed_teams.py has run, but defensively handled) gets a neutral 1.0,
    never a guessed favourable/unfavourable factor."""
    if mode == "flat" or opponent_fdr is None or opponent_fdr <= 0:
        return 1.0
    if mode in ("attack", "clean_sheet"):
        return NEUTRAL_FDR / opponent_fdr
    if mode == "pressure":
        return opponent_fdr / NEUTRAL_FDR
    return 1.0


def resolve_opponent_fdr(team_fdr_map, fixture):
    """The real difficulty of the OPPONENT in this fixture, venue-scoped:
    a club's own fdr_home/fdr_away rates how hard THAT club is to face
    depending on which venue THEY occupy (real official EFL FDR
    convention) - so if the opponent is playing at home in this fixture,
    use their fdr_home; if they're away, their fdr_away."""
    fdr_home, fdr_away = team_fdr_map.get(fixture["opponent_team_id"], (None, None))
    opponent_is_home = not fixture["is_home"]
    fdr = fdr_home if opponent_is_home else fdr_away
    return float(fdr) if fdr is not None else None


def load_scoring_rules(cur):
    cur.execute("select applies_to, stat, points from scoring_rules")
    rules = {}
    for applies_to, stat, points in cur.fetchall():
        rules.setdefault(stat, {})[applies_to] = float(points)
    return rules


def points_for(rules, stat, position):
    by_position = rules.get(stat, {})
    return by_position.get(position, by_position.get("all"))


def load_tiers(cur, table, threshold_col, value_col):
    cur.execute(f"select {threshold_col}, {value_col} from {table} order by {threshold_col}")
    return [(float(t), float(v)) for t, v in cur.fetchall()]


def load_layer_weights(cur):
    cur.execute("select horizon, position, layer, weight from layer_weights")
    weights = {}
    for horizon, position, layer, weight in cur.fetchall():
        weights.setdefault((horizon, position), {})[layer] = float(weight)
    return weights


def load_rating_anchors(cur):
    cur.execute("select horizon, position, layer, anchors from rating_anchors")
    anchors = {}
    for horizon, position, layer, raw in cur.fetchall():
        anchors[(horizon, position, layer)] = [(float(a), int(b)) for a, b in raw]
    return anchors


def resolve_current_gameweek(cur):
    """Real, GLOBAL current gameweek - unlike dreamteam-projections, Fantasy
    EFL's gameweeks are genuinely global Thursday-Wednesday blocks shared
    by all 3 divisions (confirmed live: every division was on the same
    real gameweek number when scraped), not a staggered per-club calendar,
    so there's no equivalent of dreamteam-projections' per-team
    resolve_team_current_gameweek divergence problem to solve here."""
    now = datetime.now(timezone.utc)
    cur.execute("select min(gameweek) from fixtures where kickoff_at >= %s", (now,))
    row = cur.fetchone()
    if row and row[0] is not None:
        return row[0]
    cur.execute("select max(gameweek) from fixtures")
    row = cur.fetchone()
    return row[0] if row and row[0] is not None else None


def fetch_window_fixtures(cur, team_id, current_gameweek, horizon):
    """Real confirmed fixtures for this team in [current_gameweek,
    current_gameweek + horizon - 1]. No projected-placeholder concept
    (unlike dreamteam-projections' TBA/IF cup fixtures) - Fantasy EFL only
    scores real regular-season league fixtures, and every one of those is
    already fully scheduled in the real fixture list, so there's nothing
    to project a placeholder for."""
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


def compute_position_averages(cur):
    """Real per-game rate for every priced stat, averaged across every
    player with real season-aggregate data at this position - the
    shrinkage prior for a player with few/no games of their own. Computed
    live every run (not stored) so it tracks the real pool as the season
    develops."""
    cols = sorted(set(STAT_COLUMNS.values()))
    cur.execute(
        f"""
        select p.position, sum(ps.games_played) as total_games, {', '.join(f'sum(ps.{c}) as {c}' for c in cols)}
        from player_stats ps
        join players p on p.id = ps.player_id
        where ps.gameweek is null and ps.season = %s and p.position is not null and ps.games_played > 0
        group by p.position
        """,
        (SEASON_DISPLAY,),
    )
    averages = {}
    for row in cur.fetchall():
        position, total_games, *stat_totals = row
        if not total_games:
            continue
        averages[position] = {col: (total or 0) / total_games for col, total in zip(cols, stat_totals)}
    return averages


def compute_league_avg_goals_conceded(cur):
    """Self-calibrating real average goals conceded per real club-game,
    across every real club_stats season-aggregate row - same
    "self-calibrated from this project's own real data" convention as
    dreamteam-projections' compute_neutral_attack, with the same kind of
    documented real-world fallback (a long-run EFL/EPL-wide sanity value)
    only for the genuinely-impossible case of zero real rows existing
    yet."""
    cur.execute("select sum(goals_conceded), sum(games_played) from club_stats where gameweek is null")
    total_conceded, total_games = cur.fetchone()
    if not total_games:
        return LEAGUE_AVG_GOALS_CONCEDED_FALLBACK
    return float(total_conceded or 0) / float(total_games)


def load_all_team_defense_rates(cur, league_avg_goals_conceded):
    """Real shrunk goals-conceded-per-game rate per team - the real signal
    goals_conceded_per_2 is priced from (see project_stats), since no
    real per-PLAYER goals-conceded field exists anywhere."""
    cur.execute("select team_id, games_played, goals_conceded from club_stats where gameweek is null")
    return {
        team_id: historical_shrunk_rate(games_played or 0, goals_conceded or 0, league_avg_goals_conceded)
        for team_id, games_played, goals_conceded in cur.fetchall()
    }


def load_all_team_gameweeks(cur):
    """Every real gameweek number each team had a fixture in, for every
    team at once - the real per-round EXPOSURE denominator
    compute_recent_form_rate needs (see that function's own docstring for
    why this substitutes for a per-round appearance flag that doesn't
    exist in the free data)."""
    cur.execute("select home_team_id, away_team_id, gameweek from fixtures where kickoff_at < now()")
    gameweeks_by_team = {}
    for home_id, away_id, gameweek in cur.fetchall():
        gameweeks_by_team.setdefault(home_id, set()).add(gameweek)
        gameweeks_by_team.setdefault(away_id, set()).add(gameweek)
    return {team_id: sorted(gws) for team_id, gws in gameweeks_by_team.items()}


def load_all_historical_rows(cur):
    """Every player's season-aggregate row, in one query - batched upfront
    the same way dreamteam-projections learned it had to be (see that
    project's load_all_team_games_played docstring for the real CI
    timeout this pattern fixes). Also carries real season minutes_played
    (2026-09-13 pivot) for compute_base_xmins_fraction - not itself a
    priced stat, so not part of STAT_COLUMNS, but selected alongside them."""
    cols = sorted(set(STAT_COLUMNS.values()))
    cur.execute(
        f"select player_id, games_played, minutes_played, {', '.join(cols)} from player_stats where gameweek is null and season = %s",
        (SEASON_DISPLAY,),
    )
    rows = {}
    for row in cur.fetchall():
        player_id, games_played, minutes_played, *stat_values = row
        result = {"games_played": games_played or 0, "minutes_played": minutes_played or 0}
        result.update({col: (val or 0) for col, val in zip(cols, stat_values)})
        rows[player_id] = result
    return rows


def load_all_form_rows(cur):
    """Real per-round goal/assist counts, for every player at once. Since
    the 2026-09-13 pivot a per-round player_stats row exists for every
    real appearance (see scrape_player_stats.py), but this stays scoped to
    rounds with a real non-zero goal/assist event - compute_recent_form_rate
    supplies the real per-round EXPOSURE denominator separately, from
    load_all_minutes_rows, so a round with real minutes but no goal/assist
    event is correctly treated as "played, scored zero", not skipped."""
    cur.execute(
        "select player_id, gameweek, goals, assists from player_stats "
        "where season = %s and gameweek is not null and (coalesce(goals,0) > 0 or coalesce(assists,0) > 0)",
        (SEASON_DISPLAY,),
    )
    rows_by_player = {}
    for player_id, gameweek, goals, assists in cur.fetchall():
        rows_by_player.setdefault(player_id, {})[gameweek] = {"goals": goals or 0, "assists": assists or 0}
    return rows_by_player


def load_all_minutes_rows(cur):
    """Every real per-round minutes_played value, for every real
    appearance this season - possible only since the 2026-09-13 pivot
    (live_scores gives a real row for every player who actually featured,
    confirmed live to exclude anyone with 0 minutes - so "a row exists"
    now means "genuinely played", unambiguously). Used both for
    compute_appearance_tier_shares' shrinkage evidence and as
    compute_recent_form_rate's real per-round exposure weight, replacing
    the season-wide xmins_fraction substitute load_all_form_rows' own
    docstring used to describe as the best available proxy."""
    cur.execute(
        "select player_id, gameweek, minutes_played from player_stats where season = %s and gameweek is not null and minutes_played > 0",
        (SEASON_DISPLAY,),
    )
    rows_by_player = {}
    for player_id, gameweek, minutes in cur.fetchall():
        rows_by_player.setdefault(player_id, {})[gameweek] = minutes
    return rows_by_player


MINUTES_PER_GAME = 90.0


def compute_base_xmins_fraction(minutes_played, team_games_played):
    """Real, honest SEASON-WIDE minutes fraction: minutes_played /
    (team_games_played * 90). Real pivot 2026-09-13 (see
    scrape_player_stats.py's own docstring): fantasy.efl.com's
    live_scores/{round}.json gives real per-match minutes for the first
    time, so this can finally distinguish a nailed-on 90-minute starter
    from a regular late-substitute (previously both showed the same
    games_played/team_games_played fraction - a real, documented coarser
    signal that's now retired). No shrinkage toward a prior either, same
    reasoning as dreamteam-projections: early-season volatility in
    team_games_played is real uncertainty, not something to paper over."""
    if minutes_played is None or team_games_played is None or team_games_played <= 0:
        return None
    return max(0.0, min(1.0, minutes_played / (team_games_played * MINUTES_PER_GAME)))


def compute_position_minutes_tier_averages(cur):
    """Real per-position share of a real appearance being 60+ minutes vs
    1-59 minutes (pooled sum, same convention as compute_position_averages)
    - the shrinkage prior compute_appearance_tier_shares blends toward for
    a player with few appearances of their own. Possible only since the
    2026-09-13 pivot: live_scores gives a real row for every real
    appearance (not just goal/card events), so "how many of a position's
    real appearances were 60+ minutes" is finally a real, complete
    question to ask the data."""
    cur.execute(
        """
        select p.position,
               sum(case when ps.minutes_played >= 60 then 1 else 0 end) as r60,
               sum(case when ps.minutes_played > 0 and ps.minutes_played < 60 then 1 else 0 end) as r1to59,
               count(*) as real_appearances
        from player_stats ps
        join players p on p.id = ps.player_id
        where ps.gameweek is not null and ps.season = %s and p.position is not null and ps.minutes_played > 0
        group by p.position
        """,
        (SEASON_DISPLAY,),
    )
    averages = {}
    for position, r60, r1to59, real_appearances in cur.fetchall():
        if not real_appearances:
            continue
        averages[position] = {"p60": (r60 or 0) / real_appearances, "p1to59": (r1to59 or 0) / real_appearances}
    return averages


def compute_appearance_tier_shares(games_exposure, rounds_60plus, rounds_1to59, position_tier_avg):
    """Real shrunk share of THIS player's own real appearances that were
    60+ minutes vs 1-59 minutes - replaces the old flat "every real
    appearance is assumed to be a 60+-minute one" approximation now that
    live_scores gives real per-match minutes for every real appearance
    (see scrape_player_stats.py's own pivot docstring). Same shrinkage
    machinery as every other per-game stat in this module."""
    prior = position_tier_avg or {"p60": 0.0, "p1to59": 0.0}
    p60 = historical_shrunk_rate(games_exposure, rounds_60plus, prior.get("p60", 0.0))
    p1to59 = historical_shrunk_rate(games_exposure, rounds_1to59, prior.get("p1to59", 0.0))
    return p60, p1to59


def compute_recent_form_rate(player_form_rows, player_minutes_rows, team_recent_gameweeks, col, current_gameweek, historical_prior):
    """Real recency-decayed rate for one stat, shrunk toward the player's
    own season prior. Real pivot 2026-09-13: the EXPOSURE denominator for
    each of the team's own real recent fixtures is now that specific
    round's own real minutes_played/90 (from load_all_minutes_rows) -
    replacing the season-wide xmins_fraction substitute this function used
    before live_scores gave a real per-round appearance signal (a round
    genuinely not played now correctly contributes zero exposure, not the
    season average). The real goal/assist COUNT for a round is used
    exactly when a real event row exists, zero otherwise (a round with no
    event but real minutes played is correctly scoreless, not unplayed)."""
    lookback_start = max(1, current_gameweek - RECENT_FORM_LOOKBACK)
    relevant_gameweeks = [gw for gw in team_recent_gameweeks if lookback_start <= gw < current_gameweek]
    if not relevant_gameweeks:
        return None
    weighted_value_sum = 0.0
    weighted_exposure_sum = 0.0
    for gw in relevant_gameweeks:
        weight = RECENT_FORM_DECAY ** (current_gameweek - gw - 1)
        value = player_form_rows.get(gw, {}).get(col, 0)
        exposure = player_minutes_rows.get(gw, 0) / MINUTES_PER_GAME
        weighted_value_sum += weight * value
        weighted_exposure_sum += weight * exposure
    if weighted_exposure_sum <= 0:
        return None
    return (weighted_value_sum + RECENT_FORM_K * historical_prior) / (weighted_exposure_sum + RECENT_FORM_K)


def compute_form_points_rate(player_form_rows, player_minutes_rows, team_recent_gameweeks, position, current_gameweek, historical, games_exposure, position_avg, rules):
    """Form's raw layer value: real recent goal+assist output priced
    through Fantasy EFL's own real point values, in points-per-game. None
    (populated: false) until this player's team has a real recent
    fixture in the lookback window."""
    if historical is None:
        return None
    total, any_data = 0.0, False
    for stat in RECENT_FORM_STATS:
        col = STAT_COLUMNS[stat]
        stat_points = points_for(rules, stat, position)
        if stat_points is None:
            continue
        prior = historical_shrunk_rate(games_exposure, historical.get(col, 0), position_avg.get(col, 0.0))
        rate = compute_recent_form_rate(player_form_rows, player_minutes_rows, team_recent_gameweeks, col, current_gameweek, prior)
        if rate is None:
            continue
        any_data = True
        total += rate * stat_points
    return total if any_data else None


def project_stats(rules, position, historical, games_exposure, position_avg, team_fdr_map, xmins_fraction, appearance_value_given_played, hat_trick_bonus_value, fixtures, team_goals_conceded_rate):
    """Returns (per_stat, total_points). Every priced stat is summed
    across every real fixture in the window (Fantasy EFL's own real rule:
    a double gameweek earns points from EVERY fixture, not an average of
    them - confirmed from the official Game Guidelines)."""
    per_stat = {}
    total_points = 0.0

    if xmins_fraction and fixtures:
        # Real pivot 2026-09-13: appearance_value_given_played is a real,
        # shrunk blend of the 60+/1-59-minute tiers (see
        # compute_appearance_tier_shares) - genuinely possible now that
        # live_scores gives real per-match minutes for every real
        # appearance, replacing the old flat "every appearance is
        # assumed 60+ minutes" approximation this line used to apply.
        appearance_expected = xmins_fraction * len(fixtures)
        total_points += appearance_expected * appearance_value_given_played
        per_stat["appearance"] = {"expected_count": round(appearance_expected, 3), "points": round(appearance_expected * appearance_value_given_played, 2)}

    for stat, col in STAT_COLUMNS.items():
        stat_points = points_for(rules, stat, position)
        if stat_points is None:
            continue  # e.g. clean_sheet_60min/goals_conceded_per_2 don't apply to MID/FWD.
        mode = STAT_FIXTURE_MODE.get(stat, "flat")
        pos_avg_rate = position_avg.get(col, 0.0)
        historical_total = historical.get(col, 0) if historical else 0
        shrunk_rate = historical_shrunk_rate(games_exposure, historical_total, pos_avg_rate)

        expected_total = 0.0
        hat_trick_total = 0.0
        for fixture in fixtures:
            opponent_fdr = resolve_opponent_fdr(team_fdr_map, fixture)
            factor = fixture_factor_from_fdr(mode, opponent_fdr)
            lam = shrunk_rate * factor * (xmins_fraction or 0.0)
            expected_total += lam
            if stat == "goal":
                # Real bonus on top of normal per-goal points - "3 or more
                # goals scored = +5" - via the same closed-form Poisson
                # tail already used for the frontend's own 2+ goals stat,
                # reusing this fixture's own just-computed goal lambda
                # rather than a second, separately-fitted rate.
                hat_trick_total += probability_at_least(3, lam) * hat_trick_bonus_value

        per_stat[stat] = {"expected_count": round(expected_total, 3), "points": round(expected_total * stat_points, 2)}
        total_points += expected_total * stat_points
        if hat_trick_total:
            per_stat["hat_trick_bonus"] = {"points": round(hat_trick_total, 2)}
            total_points += hat_trick_total

    # goals_conceded_per_2 is NOT in STAT_COLUMNS above - no real per-
    # PLAYER goals-conceded field exists anywhere (only a per-club one,
    # see scrape_player_stats.py's own docstring). Priced from the
    # player's own TEAM's real defensive record instead - genuinely more
    # correct anyway (conceding is a team outcome a GK/DEF simply
    # inherits by being on the pitch), not a fallback guess.
    gc_points = points_for(rules, "goals_conceded_per_2", position)
    if gc_points is not None and team_goals_conceded_rate is not None:
        expected_total = 0.0
        for fixture in fixtures:
            opponent_fdr = resolve_opponent_fdr(team_fdr_map, fixture)
            factor = fixture_factor_from_fdr("pressure", opponent_fdr)
            expected_total += team_goals_conceded_rate * factor * (xmins_fraction or 0.0)
        per_stat["goals_conceded_per_2"] = {"expected_count": round(expected_total, 3), "points": round(expected_total * gc_points, 2)}
        total_points += expected_total * gc_points

    return per_stat, total_points


def project_layers(position, horizon, fixtures, team_fdr_map, team_names, xmins_fraction, form_raw, weights, rating_anchors):
    pw = POSITION_WEIGHTS[position]
    fixture_quantity_raw = len(fixtures) / horizon if horizon else None

    fixture_list = []
    quality_scores = []
    for f in fixtures:
        opponent_fdr = resolve_opponent_fdr(team_fdr_map, f)
        if opponent_fdr is not None:
            # Attack and clean-sheet factors collapse to the same real
            # number in this FDR-only model (no separate attack-strength
            # vs defense-strength signal exists without live xG) - the
            # position-weighted blend is kept structurally (rather than
            # simplified away) so a future real per-direction signal (e.g.
            # once a Premium odds scraper exists) slots in without a
            # reshape.
            factor = NEUTRAL_FDR / opponent_fdr
            quality_scores.append(pw["attack"] * factor + pw["clean_sheet"] * factor)
        fixture_list.append({
            "opponent": team_names.get(f["opponent_team_id"], "?"),
            "is_home": f["is_home"],
            "kickoff_at": f["kickoff_at"].isoformat(),
            "gameweek": f["gameweek"],
            "opponent_fdr": opponent_fdr,
        })
    fixture_quality_raw = sum(quality_scores) / len(quality_scores) if quality_scores else None

    per_layer = {
        "xmins": {"value": round(xmins_fraction, 3) if xmins_fraction is not None else None, "populated": xmins_fraction is not None},
        "form": {"value": round(form_raw, 3) if form_raw is not None else None, "populated": form_raw is not None, "weight": weights.get("form")},
        "fixture_quantity": {"value": round(fixture_quantity_raw, 3) if fixture_quantity_raw is not None else None,
                              "populated": fixture_quantity_raw is not None, "weight": weights.get("fixture_quantity"),
                              "fixtures": fixture_list},
        "fixture_quality": {"value": round(fixture_quality_raw, 3) if fixture_quality_raw is not None else None,
                             "populated": fixture_quality_raw is not None, "weight": weights.get("fixture_quality")},
        # Genuinely unpopulated - see module docstring. Renormalizes away
        # via weighted_average below, same as dreamteam-projections
        # already does for any fixture with no posted odds yet.
        "live_odds": {"value": None, "populated": False, "weight": weights.get("live_odds")},
    }

    layer_ratings = {}
    for layer in ("form", "fixture_quantity", "fixture_quality", "live_odds"):
        mapped = absolute_rating(per_layer[layer]["value"], rating_anchors.get((horizon, position, layer)))
        if mapped is not None:
            layer_ratings[layer] = mapped

    rating, _ = weighted_average(layer_ratings, weights)
    if rating is not None:
        rating = round(rating * xmins_rating_multiplier(xmins_fraction), 1)
    return per_layer, rating


def main():
    conn = db_connect()
    conn.autocommit = False
    cur = conn.cursor()

    try:
        current_gameweek = resolve_current_gameweek(cur)
        if current_gameweek is None:
            raise SystemExit("No real fixtures with a gameweek found - run scrape_fixtures.py first.")
        print(f"Current gameweek: {current_gameweek}")

        rules = load_scoring_rules(cur)
        appearance_tiers = load_tiers(cur, "appearance_points_tiers", "min_minutes", "points")
        hat_trick_tiers = load_tiers(cur, "hat_trick_bonus_tiers", "min_goals", "points")
        hat_trick_bonus_value = tiered_lookup(3, hat_trick_tiers)
        layer_weights = load_layer_weights(cur)
        rating_anchors = load_rating_anchors(cur)
        position_averages = compute_position_averages(cur)
        position_minutes_tier_averages = compute_position_minutes_tier_averages(cur)
        appearance_60_value = tiered_lookup(60, appearance_tiers)
        appearance_1_value = tiered_lookup(1, appearance_tiers)

        cur.execute("select coalesce(max(revision), 0) + 1 from algorithm_versions")
        revision = cur.fetchone()[0]
        weights_snapshot = {
            "layer_weights": {f"{h}|{p}": w for (h, p), w in layer_weights.items()},
            "scoring_rules": rules,
        }
        cur.execute(
            "insert into algorithm_versions (revision, weights, created_by, note) values (%s, %s, %s, %s) returning id",
            (revision, json.dumps(weights_snapshot), "compute_player_projections.py", f"Auto-generated run for gameweek {current_gameweek}"),
        )
        algorithm_version_id = cur.fetchone()[0]

        cur.execute("select id, position, team_id from players where is_active and position is not null and team_id is not null")
        players = cur.fetchall()
        print(f"{len(players)} active, positioned players to project.")

        historical_rows = load_all_historical_rows(cur)
        form_rows_map = load_all_form_rows(cur)
        minutes_rows_map = load_all_minutes_rows(cur)
        team_gameweeks_map = load_all_team_gameweeks(cur)

        cur.execute("select team_id, games_played from club_stats where gameweek is null")
        team_games_played_map = {team_id: (games or 0) for team_id, games in cur.fetchall()}

        league_avg_goals_conceded = compute_league_avg_goals_conceded(cur)
        team_defense_rates = load_all_team_defense_rates(cur, league_avg_goals_conceded)
        print(f"League-average goals conceded per game (self-calibrated): {round(league_avg_goals_conceded, 3)}")

        cur.execute("select id, fdr_home, fdr_away from teams")
        team_fdr_map = {team_id: (fdr_home, fdr_away) for team_id, fdr_home, fdr_away in cur.fetchall()}

        cur.execute("select id, name from teams")
        team_names = dict(cur.fetchall())

        team_ids = sorted({team_id for _, _, team_id in players})
        window_fixtures_cache = {
            (team_id, horizon): fetch_window_fixtures(cur, team_id, current_gameweek, horizon)
            for team_id in team_ids
            for horizon in HORIZONS
        }

        # Every projection row computed in Python first, written in ONE
        # batched execute_values call at the end - not one INSERT per
        # player-horizon combination. The very first real run of this
        # script (unbatched) was already too slow against the real hosted
        # Supabase connection for the same reason dreamteam-projections
        # documents hitting a 37-minute CI timeout over - caught and fixed
        # here before it ever finished a run, not after.
        rows = []
        no_fixtures = 0
        for player_id, position, team_id in players:
            historical = historical_rows.get(player_id)
            games_exposure = historical.get("games_played", 0) if historical else 0
            minutes_played = historical.get("minutes_played", 0) if historical else 0
            team_games_played = team_games_played_map.get(team_id, 0)
            xmins_fraction = compute_base_xmins_fraction(minutes_played, team_games_played)
            player_form_rows = form_rows_map.get(player_id, {})
            player_minutes_rows = minutes_rows_map.get(player_id, {})
            team_recent_gameweeks = team_gameweeks_map.get(team_id, [])
            form_raw = compute_form_points_rate(
                player_form_rows, player_minutes_rows, team_recent_gameweeks, position, current_gameweek,
                historical, games_exposure, position_averages.get(position, {}), rules,
            )
            team_goals_conceded_rate = team_defense_rates.get(team_id)

            rounds_60plus = sum(1 for m in player_minutes_rows.values() if m >= 60)
            rounds_1to59 = sum(1 for m in player_minutes_rows.values() if m < 60)
            p60, p1to59 = compute_appearance_tier_shares(
                games_exposure, rounds_60plus, rounds_1to59, position_minutes_tier_averages.get(position),
            )
            appearance_value_given_played = p60 * appearance_60_value + p1to59 * appearance_1_value

            for horizon in HORIZONS:
                fixtures = window_fixtures_cache.get((team_id, horizon), [])
                if not fixtures:
                    no_fixtures += 1
                    continue

                per_stat, total_points = project_stats(
                    rules, position, historical, games_exposure, position_averages.get(position, {}),
                    team_fdr_map, xmins_fraction, appearance_value_given_played, hat_trick_bonus_value, fixtures, team_goals_conceded_rate,
                )
                per_layer, rating = project_layers(
                    position, horizon, fixtures, team_fdr_map, team_names, xmins_fraction, form_raw,
                    layer_weights.get((horizon, position), {}), rating_anchors,
                )
                rows.append((player_id, current_gameweek, horizon, algorithm_version_id, round(total_points, 2), rating, json.dumps(per_stat), json.dumps(per_layer)))

        execute_values(
            cur,
            """
            insert into projections (player_id, gameweek, horizon, algorithm_version_id, total_points, rating, per_stat, per_layer)
            values %s
            on conflict (player_id, gameweek, horizon, algorithm_version_id) do update
                set total_points = excluded.total_points, rating = excluded.rating,
                    per_stat = excluded.per_stat, per_layer = excluded.per_layer
            """,
            rows,
        )

        conn.commit()
        print(f"\nDone: {len(rows)} projections written (algorithm_version_id={algorithm_version_id}, revision={revision}).")
        print(f"{no_fixtures} player-horizon combinations skipped - no real fixture in that window yet (a genuine blank).")
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
