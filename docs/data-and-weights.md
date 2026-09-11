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

## The five layers

Every player's rating is built from five independently-weighted layers,
combined per horizon (1/2/3/5 gameweeks) and per position - same structure
`dreamteam-projections` proved out. A layer with no real data for a given
player simply doesn't contribute - the others renormalize over whichever
layers are actually populated.

| # | Layer | What it answers | Status |
|---|---|---|---|
| 1 | Xmins | Will this player actually play? | Built - season-wide appearance-rate proxy (`appearances / team_games_played`), NOT minutes-weighted like Dream Team's (see Known limitations) |
| 2 | Form | How has this player performed recently, decay-weighted? | Built - real per-round goal/assist counts, derived from `rounds.json`'s real match events (see Known limitations for the real per-round exposure adaptation this needed) |
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

## Scoring model

Fantasy EFL's real rules (`fantasy.efl.com/help/game-guidelines`, quoted
verbatim during planning) are mostly linear per-unit rates - the
`scoring_rules(applies_to, stat, points)` shape (migration `0005`): assist=3,
goal=5-10 by position, tackle=0.5/DEF, key_pass=0.5/MID+FWD, etc. - every
value is `real rule ÷ real unit count`.

Two rules are genuinely tiered (migration `0006_tiered_scoring.sql`):

- **Appearance points** - +1 for 1-59 real minutes, +2 for 60+, mutually
  exclusive (not additive like Dream Team's own appearance rule).
  `appearance_points_tiers` seeded (0,0)/(1,1)/(60,2). Since no raw minutes
  field exists (see Known limitations), the engine assumes every real
  appearance is a 60+-minute one - a documented approximation.
- **Hat-trick bonus** - +5 for 3+ real goals in a match, on top of normal
  per-goal points, via a real closed-form Poisson tail probability
  (`probability_at_least(3, lambda)`) applied to each fixture's own
  just-computed goal expectation.

**No synthetic Bonus-Points-PPM system is needed** - Fantasy EFL's real
scoring table already prices raw counted events directly, and (after the
pivot above) the real data source now actually provides them.

**Cards, own goals, and missed penalties ARE priced** (a real gap in the
original DreamTeamTonic-based plan, closed by the pivot): derived from real
match events in `rounds.json` (`YellowCard`/`RedCard`/`OwnGoal`/`Penalty`),
aggregated per player per round by `scrape_player_stats.py`. See Known
limitations for the real evidence behind treating a `Penalty` event as
"missed" rather than "scored."

**`goals_conceded_per_2` has no real per-player source** - `players.json`
gives real `cleanSheets` per player but no per-player goals-conceded count.
Priced from the player's own TEAM's real defensive record instead
(`compute_player_projections.py`'s dedicated `team_goals_conceded_rate`
step) - arguably more correct anyway, since conceding is fundamentally a
team outcome a GK/DEF inherits by being on the pitch, not a fallback guess.

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
| `fantasy.efl.com/json/fantasy/rounds.json` | All 42 real gameweeks: each with real `games` (home/away by squadId, real score, real status) AND real per-game `events` (`Goal`/`YellowCard`/`RedCard`/`OwnGoal`/`Penalty`, each with `playerId`/`minute`/`assistPlayerId`) | `fixtures` (from `games`); real per-round `player_stats`/`club_stats` rows (derived from `events`/results by `scrape_player_stats.py`/`scrape_club_stats.py`) | The single richest source in this project - genuine match-event data, not an aggregate mirror. A `Penalty` event carries only the taker's `playerId` - confirmed live that 0 of 35 real `Penalty` events this season have a same-minute `Goal` for the same player, supporting "missed penalty" over "scored" (a scored one would show as `Goal` instead) |
| `fantasy.efl.com/json/fantasy/players.json` | Real season-aggregate stats for ~3570 players: identity, `position`, `squadId`, real `goalsScored`/`assists`/`keyPasses`/`shotsOnTarget`/`cleanSheets`/`clearances`/`blocks`/`tackles`/`interceptions`/`saves`/`appearances`, `percentSelected`, `status`/`injuryDetails`/`suspensionDetails`, real `totalPoints`/`averagePoints`, `lastThree` (real points for the last 3 real rounds) | `players`, season-aggregate `player_stats` | The real per-stat source the DreamTeamTonic mirror turned out not to have - see the pivot note |

## Known limitations

- **No raw per-match minutes-played field** anywhere in the free data -
  only `appearances` (a season-wide count). Xmins uses
  `appearances / team_games_played` as a season-wide start-rate proxy - it
  can't distinguish "always starts and plays 90" from "always starts but
  subbed off at 60." Appearance points assume every real appearance is a
  60+-minute one for the same reason - both real, documented gaps, not
  silent guesses.
- **No real per-round "did this player play" flag** - only real per-round
  goal/assist/card/own-goal/missed-penalty EVENTS exist (from `rounds.json`
  - a round with no event row is genuinely ambiguous between "didn't play"
  and "played but did nothing notable"). Form's recency calculation works
  around this by using the player's own season-wide Xmins fraction as the
  real per-round EXPOSURE weight (rather than a nonexistent per-round
  appearance flag), applied across every real gameweek the player's TEAM
  had a fixture in (a fully real, known fact from `fixtures`) - the real
  goal/assist COUNT for a round is used exactly when a real event exists,
  zero otherwise. Club Form has no equivalent gap - a club's real
  `games_played` per round is always a known fact, not a proxy.
- **No real per-player goals-conceded field** - see "Scoring model" above;
  priced from the player's own team's real defensive record instead.
- **No real penalty-save attribution** - the real `Penalty` event only
  carries the taker's `playerId`, never a saving goalkeeper's. This one
  stat (`penalty_save`, a real `scoring_rules` row) stays genuinely
  unpriced - a documented gap, not guessed.
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
