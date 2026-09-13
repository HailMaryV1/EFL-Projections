# Data and weights

The living record of what feeds this model, in plain terms: which real data
source, what it becomes, which layer or weight consumes it, and what its
known limits are. Update this in the same commit as the code change that
makes it true - it should never describe a future state, only what's
actually running.

## Real pivot, 2026-09: primary data source changed mid-build

Phase 2 originally shipped against DreamTeamTonic's `fefl/*` API (a
third-party mirror of Fantasy EFL data). While building the Phase 3 engine,
a direct check against the live API found every per-event stat field
(`goals`, `assists`, `tackles`, `shotsOnTarget`, `cleanSheets`, `clearances`,
`blocks`, `interceptions`, `saves`, `keyPasses`) was a genuine **zero for
every one of the 3570 real players**, confirmed by summing across the whole
pool - not a scraper bug, not a small-sample early-season artefact. Only
`totalPoints`/`averagePoints`/`gamesPlayed`/`percentSelected` carried real,
differentiated values.

The user pointed at two other real sources; the official game's own
`fantasy.efl.com/json/fantasy/*` static JSON turned out to have completely
real, differentiated per-stat data (confirmed: a real forward with 52 points
showed real `goalsScored: 5`, `assists: 1`, `shotsOnTarget: 10`, etc.) -
free, unauthenticated, no login. The whole pipeline (`seed_teams.py`,
`scrape_fixtures.py`, `scrape_player_stats.py`, `scrape_club_stats.py`) was
rebuilt around this source instead. See "Data sources" below for the
current, real endpoint table - the DreamTeamTonic-based version is gone,
not kept as a fallback (one verified-real source beats two, one of which
was silently wrong).

## Real pivot, 2026-09-13: live_scores replaces rounds.json for per-round player stats

Found live (a user pointed at the official site's own per-player "Matches"
breakdown and asked why the pipeline wasn't using it) that
`fantasy.efl.com/json/fantasy/live_scores/{round}.json` is ALSO fully
public - no login needed, confirmed by fetching it from a fresh,
unauthenticated browser session - and gives a genuine per-player,
per-MATCH breakdown for every real player who played that round, not just
ones with a scoring event: real `minutesPlayed`, real `penaltySaves`, and
the real official `points` total for that match, alongside every other
priced stat. This replaced `rounds.json`'s events array as
`scrape_player_stats.py`'s per-round source entirely (`rounds.json` is
still used by `scrape_fixtures.py`/`scrape_club_stats.py` for real match
results). This single pivot closed most of what "Known limitations" used
to list as permanent gaps - see that section below for what's left.

It also uncovered and fixed two real bugs that were silently deflating
every player projection and breaking the accuracy pipeline:
`scrape_club_stats.py` was double-counting `games_played`/goals/etc for
rounds 1-3 because `rounds.json` returns a genuine duplicate (empty)
round object for those rounds, which inflated `team_games_played` and
suppressed every player's Xmins-multiplied stat; and thousands of stale,
all-zero `player_stats` rows from the original (pre-pivot) DreamTeamTonic
scraper had never been cleaned up, so `capture_actuals.py` was copying
that stale `0.00` in as a real GW5 result for players who'd actually
played. Both are fixed; the stale rows were deleted (identified by their
shared real `created_at` timestamp, predating the fantasy.efl.com pivot).

## The five layers

Every player's rating is built from five independently-weighted layers,
combined per horizon (1/2/3/5 gameweeks) and per position - same structure
`dreamteam-projections` proved out. A layer with no real data for a given
player simply doesn't contribute - the others renormalize over whichever
layers are actually populated.

| # | Layer | What it answers | Status |
|---|---|---|---|
| 1 | Xmins | Will this player actually play? | Built - real season-wide minutes fraction (`minutes_played / (team_games_played * 90)`, from `live_scores`) - minutes-weighted like Dream Team's, since the 2026-09-13 pivot |
| 2 | Form | How has this player performed recently, decay-weighted? | Built - real per-round goal/assist counts, with each real round's own real minutes/90 as the exposure weight (since the 2026-09-13 pivot - see Known limitations for what this replaced) |
| 3 | Fixture Quantity | How many fixtures fall in this horizon window? | Built - real fixtures per division; no cup fixtures ever count (regular EFL season only) |
| 4 | Fixture Quality | How hard are those fixtures? | Built - real official `fdrHome`/`fdrAway` ratings for every club (`teams.fdr_home`/`fdr_away`) |
| 5 | Live Odds | What does the real betting market say, if it's posted yet? | **Not yet populated** - the one real source found (DreamTeamTonic's `fantasy-efl/tools/market-odds`) is Premium-gated; will be built once a real Premium login exists to test against |

`rating` stays `null` until real measured anchors exist in `rating_anchors`
(empty by design - see that table's migration) - same "zero real samples
yet" convention as Dream Team, not yet built (needs the Phase 4 admin
recalibration action).

### Club projections

`scripts/compute_club_projections.py` - genuinely new, no Dream Team
equivalent. Real win/draw/away-win/clean-sheet/2+/4+-goals expected counts
per club per horizon, from a standard independent-Poisson scoreline model
(same real math as `dreamteam-projections`'s own `match_outcome_probs`):
each club's real season-to-date attack (goals scored/game) and defense
(goals conceded/game) strength, shrunk toward the real self-calibrated
league average, combined multiplicatively with the opponent's own strength
and a documented `HOME_ADVANTAGE = 1.15` constant (a standard, widely-
studied real football effect, not fitted from this project's own thin
sample). No live-odds source exists for clubs either, so this is the
primary signal, not a fallback. Form uses a *fully real* per-round exposure
(a club's `games_played` per round is always a known fact - no proxy needed
the way player Form needed one).

`per_stat.fixtures` (added for Phase 5's Fixture Forecast page) carries the
real per-fixture win/draw/loss/clean-sheet/2+-goals probabilities and
expected goals behind the summed horizon totals - read directly by
`/fixtures`, never recomputed client-side, same "read what the engine
produced" principle the player engine's own `per_layer.fixture_quantity.
fixtures` already follows.

## Scoring model

Fantasy EFL's real rules (`fantasy.efl.com/help/game-guidelines`, quoted
verbatim during planning) are mostly linear per-unit rates - the
`scoring_rules(applies_to, stat, points)` shape (migration `0005`): assist=3,
goal=5-10 by position, tackle=0.5/DEF, key_pass=0.5/MID+FWD, etc. - every
value is `real rule ÷ real unit count`.

Two rules are genuinely tiered (migration `0006_tiered_scoring.sql`):

- **Appearance points** - +1 for 1-59 real minutes, +2 for 60+, mutually
  exclusive (not additive like Dream Team's own appearance rule).
  `appearance_points_tiers` seeded (0,0)/(1,1)/(60,2). Since the 2026-09-13
  pivot, the engine uses a real shrunk blend of this player's own real
  60+/1-59-minute split (`compute_appearance_tier_shares`) instead of
  assuming every real appearance is a 60+-minute one.
- **Hat-trick bonus** - +5 for 3+ real goals in a match, on top of normal
  per-goal points, via a real closed-form Poisson tail probability
  (`probability_at_least(3, lambda)`) applied to each fixture's own
  just-computed goal expectation.

**No synthetic Bonus-Points-PPM system is needed** - Fantasy EFL's real
scoring table already prices raw counted events directly, and (after the
pivot above) the real data source now actually provides them.

**Cards, own goals, missed penalties, and penalty saves ARE priced**: since
the 2026-09-13 pivot, `live_scores/{round}.json` gives real per-player,
per-match `yellowCards`/`redCards`/`ownGoals`/`penaltyMisses`/`penaltySaves`
directly - no inference needed any more (previously `missed_penalty` had to
be inferred from a `Penalty` event in `rounds.json` with no same-minute
`Goal` for the same player, and `penalty_save` was entirely unpriced - see
Known limitations for what's left).

**`goals_conceded_per_2` still has no real per-player pricing source used**
- `live_scores` does give a real per-player `goalsConceded` now (stored on
`player_stats` for completeness/player-page display), but the engine still
deliberately prices this stat from the player's own TEAM's real defensive
record instead (`compute_player_projections.py`'s dedicated
`team_goals_conceded_rate` step) - conceding is fundamentally a team
outcome a GK/DEF inherits by being on the pitch, not an individual rate
worth its own shrinkage.

### Club scoring

`club_scoring_rules` (migration `0007`): win=5, draw=3, away_win=2 (only
when the picked club was away and won), clean_sheet=2, two_plus_goals=2,
four_plus_goals=2 - all computed from real per-fixture goal expectations
via the club Poisson model above, not historical counts (the free data has
no real "4+ goal games" field at all - see Known limitations).

## Data sources

All real, free, and unauthenticated - `fantasy.efl.com`'s own static JSON,
the official game's own data (not a third-party mirror - see the pivot
note above for why).

| Source | What it provides | Feeds | Known caveats |
|---|---|---|---|
| `fantasy.efl.com/json/fantasy/competitions.json` | The real competitionId -> division mapping: 10=Championship, 11=League One, 12=League Two | Competition resolution in every other script | Static, rarely changes |
| `fantasy.efl.com/json/fantasy/squads.json` | All 72 real clubs: `id`, `name`, `shortName`, `abbreviation`, real `fdrHome`/`fdrAway`, `leaguePosition`, `last3Form`, `totalPoints`/`averagePoints`/`percentSelected`, badge/colours | `teams` | One real call returns every division at once (no per-competition filtering needed, unlike the DreamTeamTonic version this replaced) |
| `fantasy.efl.com/json/fantasy/rounds.json` | All 42 real gameweeks: each with real `games` (home/away by squadId, real score, real status) | `fixtures` (from `games`); real per-round `club_stats` (derived from match results by `scrape_club_stats.py`) | Returns a genuine duplicate (empty) round object for rounds 1-3 (see the 2026-09-13 pivot note above) - `build_round_and_season_stats` groups by round number before aggregating to avoid double-counting. No longer used for per-player stats (see `live_scores` below) |
| `fantasy.efl.com/json/fantasy/players.json` | Real identity for ~3570 players: name, `position`, `squadId`, `percentSelected`, `status`/`injuryDetails`/`suspensionDetails` | `players` | Its own aggregate stat fields (`goalsScored`/`assists`/etc) are no longer used - see `live_scores` below |
| `fantasy.efl.com/json/fantasy/live_scores/{round}.json` | Real per-player, per-MATCH totals for every real player who played that round (not just scorers): `minutesPlayed`, `points` (the real official fantasy total for that match), `goalsScored`/`assists`/`keyPasses`/`shotsOnTarget`/`cleanSheet`/`clearances`/`blocks`/`tackles`/`interceptions`/`saves`/`goalsConceded`/`yellowCards`/`redCards`/`ownGoals`/`penaltyMisses`/`penaltySaves`/`hatTricks` | Real per-round `player_stats` rows AND the season-aggregate row (summed across every real round captured) - `scrape_player_stats.py` | Found 2026-09-13 (a user pointed at the official site's own per-player "Matches" tab and asked why it wasn't being used). Fully public, no login. Returns an empty `players` list for a round not yet played - a real, valid response, not an error. A double gameweek genuinely gives more than one real row per player per round; summed, matching Fantasy EFL's own real "every fixture counts" rule |

## Known limitations

Mostly resolved by the 2026-09-13 `live_scores` pivot (see that note
above) - what's left:

- **No real per-player goals-conceded PRICING** - `live_scores` does give a
  real per-player `goalsConceded` now (stored for completeness), but the
  engine still deliberately prices this stat from the player's own team's
  real defensive record instead (see "Scoring model" above) - a design
  choice, not a data gap.
- **No real "4+ goal games" field** for clubs - `club_stats.
  four_plus_goal_games` is computed directly from real match scores in
  `scrape_club_stats.py` (a team's own goals in a real completed game
  `>= 4`), so this is actually real and populated, unlike the equivalent
  gap in the original DreamTeamTonic-based plan.
- **Live Odds layer is unpopulated for now.** The one real live-market
  source found (DreamTeamTonic's `fantasy-efl/tools/market-odds`) sits
  behind a £3.99/mth Premium paywall - confirmed by hitting a real paywall
  redirect when accessed without login. Per this project's own "never
  fabricate a number" rule, the layer simply stays `populated: false` and
  the other four layers renormalize over the real remaining weight. A
  Premium-login scraper will be built once a real DreamTeamTonic Premium
  account exists to test against (the user's own account/credentials,
  stored in `.env`/GitHub Secrets - never a value typed into chat). Both
  the player and club Poisson-style models currently run on real
  historical goals data and official FDR instead of live market xG.
- **No cup competitions** - Fantasy EFL only scores "actual performances
  during the regular EFL season," confirmed from the official rules text.
  `fixtures`/`player_stats`/`club_stats` never need a competition value
  outside `championship`/`league_one`/`league_two`.
- **No Monte Carlo simulation** (`boom_probability`/`sim_floor`/
  `sim_ceiling`) in v1 - `projections` has no columns for it (deliberately
  cut from scope to keep the first real engine simpler - see that
  migration's own comment). Can be added later the same way Dream Team's
  own migration 0020 did.
