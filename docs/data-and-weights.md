# Data and weights

The living record of what feeds this model, in plain terms: which real data
source, what it becomes, which layer or weight consumes it, and what its
known limits are. Update this in the same commit as the code change that
makes it true - it should never describe a future state, only what's
actually running.

## The five layers

Every player's rating is (planned to be, once Phase 3 lands) built from five
independently-weighted layers, combined per horizon (1/2/3/5 gameweeks) and
per position - same structure `dreamteam-projections` already proved out. A
layer with no real data for a given player simply doesn't contribute - the
others renormalize over whichever layers are actually populated.

| # | Layer | What it answers | Status |
|---|---|---|---|
| 1 | Xmins | Will this player actually play? | Planned - will use a season-wide appearance-rate proxy (`gamesPlayed / team_games_played`), NOT minutes-weighted like Dream Team's, since no raw minutes field exists in the free data (see Known limitations) |
| 2 | Form | How has this player performed recently, decay-weighted? | Planned - real per-gameweek stats exist (`fefl/overall-stats-by-gw?fromGW=N&toGW=N`), confirmed to genuinely scope per gameweek |
| 3 | Fixture Quantity | How many fixtures fall in this horizon window? | Planned - real fixtures exist per division; unlike Dream Team, no cup fixtures ever count (regular EFL season only), so no cup-rotation handling is needed here |
| 4 | Fixture Quality | How hard are those fixtures? | Planned - real official `fdrHome`/`fdrAway` ratings exist for every club (free, from `fefl/squads`) |
| 5 | Live Odds | What does the real betting market say, if it's posted yet? | **Not yet populated** - the one real source found (DreamTeamTonic's `fantasy-efl/tools/market-odds`) is Premium-gated; will be built once a real Premium login exists to test against (see Known limitations) |

`rating` (the 1-10 view) will additionally need real measured anchors per
layer/position/horizon in `rating_anchors` before it stops returning null -
same deliberate "zero real samples yet" convention as Dream Team.

Club projections (the 2-club-pick side of the game, which Dream Team has no
equivalent of) are planned as a separate, simpler engine: real match-outcome
probabilities (win/draw/away-win/clean-sheet/2+/4+ goals) derived from each
club's official FDR-implied strength and real historical goal-scoring/
conceding rates, Poisson-derived the same way `dreamteam-projections`'s
`import_dreamteamtonic_market_odds.py` already turns two teams' xG into a
1X2 probability.

## Scoring model

Fantasy EFL's real rules (`fantasy.efl.com/help/game-guidelines`, read in
full and quoted verbatim in commit history / the planning session) are
mostly linear per-unit rates - the same `scoring_rules(applies_to, stat,
points)` shape Dream Team already uses, just with EFL's own real point
values (see migration `0005_scoring_rules.sql` for the exact seeded numbers:
assist=3, goal=5-10 depending on position, tackle=0.5 per DEF, key_pass=0.5
per MID/FWD, etc. - every value there is `real rule ÷ real unit count`, nothing
invented).

Two rules are genuinely tiered, not linear, and reuse the exact
`bonus_tiers`/`pass_completion_tiers` tiered-lookup pattern Dream Team
already proved out (migration `0006_tiered_scoring.sql`):

- **Appearance points** - +1 for 1-59 real minutes played, +2 for 60+,
  **mutually exclusive** (unlike Dream Team's own appearance rule, which
  adds a separate `minutes_60_plus` bonus on top of a flat `appearance`
  point - EFL's official wording is "Appearance (up to 59 minutes) +1 /
  Appearance (60+ minutes) +2", two tiers of the same category, not two
  additive rows). `appearance_points_tiers` seeded (0,0)/(1,1)/(60,2).
- **Hat-trick bonus** - +5 for 3 or more real goals in a single match, on
  top of normal per-goal points. `hat_trick_bonus_tiers` seeded (0,0)/(3,5).

Clean sheet's real 60-minute-played qualifier is a simple gate in the future
engine (mirrors Dream Team's own `clean_sheet_60min` naming), not a table.

**No synthetic Bonus-Points-PPM system is needed here** - unlike Dream
Team, where the game's own real scoring rules don't expose enough raw event
detail so a proxy "Player Performance Marks" system had to be built, Fantasy
EFL's real scoring table already prices raw counted events (clearances,
blocks, tackles, interceptions, key passes, shots on target) directly and
DreamTeamTonic's free player-stats source already provides exactly those
counts. A real simplification, not a corner cut.

### Club scoring

`club_scoring_rules` (migration `0007_club_scoring_rules.sql`), seeded from
the real rules: win=5, draw=3, away_win=2 (only applies when the picked club
was the away side and won), clean_sheet=2, two_plus_goals=2,
four_plus_goals=2.

## Data sources

One row per real data source, verified live this session (browsed directly,
never guessed) - see `CLAUDE.md`'s own "Real data sources" table for the
short version; this is the same table, kept in both places since CLAUDE.md
is the fast-scan status doc and this file is the detailed one.

| Source | What it provides | Feeds | Known caveats |
|---|---|---|---|
| `fefl/squads?season=202627&competition={championship\|league-one\|league-two}` (no login) | All 72 real clubs per division: `squadId`, `name`, `shortName`, `abbreviation`, official `fdrHome`/`fdrAway`, `leaguePosition`, badge/colours | `teams` | One call per division (3 total) - the API doesn't return all divisions in one unfiltered call |
| `storage.googleapis.com/dttfixturelists/fefl-{championship\|league-one\|league-two}Fixtures.json` (static JSON, no login) | Real fixtures per division: `home`/`away` (full team name strings), `gw`, `timestamp`, `score`, `status` | `fixtures` | Team names are plain strings, not IDs - resolved against `teams.name` by exact match (both come from the same DreamTeamTonic backend); if a real mismatch ever turns up, `dreamteam-projections/scripts/name_matching.py`'s resolver is available to port over, not yet needed |
| `fefl/overall-stats-by-gw?fromGW=N&toGW=N&season=202627` (no login) | Real per-gameweek-range player stats for ~3570 players: `playerId`, name fields, `position`, `squadId`/`squadName`, `goals`/`assists`/`keyPasses`/`shotsOnTarget`/`cleanSheets`/`clearances`/`blocks`/`tackles`/`interceptions`/`saves`/`goalsConceded`, `percentSelected`, `status`/`injuryStatus`/`injuryType`/`suspensionDetail`, `gamesPlayed`, DreamTeamTonic's own real `totalPoints`/`averagePoints` | `players`, `player_stats` | Confirmed live that `fromGW`/`toGW` genuinely scope (a single-gameweek call differs correctly from a season-long aggregate) - no repeat of the "believed the params were ignored" mistake `dreamteam-projections` made once. No raw minutes-played field - see Known limitations. "Per game" (single-fixture, not gameweek-range) detail is Premium-gated. |
| `fefl/club-stats-by-gw?fromGW=N&toGW=N&season=202627` (no login) | Real per-club per-gameweek-range stats for all 72 clubs: `cleanSheets`, `goalsScored`/`goalsConceded`, `twoGoalGames`, real league-table columns (`leaguePoints`/`leaguePosition`/`leagueGoalsFor`/`leagueGoalsAgainst`), `fdrHome`/`fdrAway`, DreamTeamTonic's own real fantasy club `totalPoints` | `club_stats` | Same gameweek-range scoping as the player endpoint |
| `fefl/current-gameweek?season=202627` (no login) | `{currentGameweek, totalGameweeks: 39, totalGameweeksWithPlayoffs: 42}` | gameweek resolution | One global number, not per-team like Dream Team needed - Fantasy EFL's gameweeks are fixed Thursday-Wednesday blocks, not a staggered per-club PL calendar, so there's no equivalent of `resolve_team_current_gameweek`'s per-team divergence problem |

## Known limitations

- **No raw per-match minutes-played field** anywhere in the free data - only
  `gamesPlayed` (an appearance count) and `totalPoints`/`averagePoints`
  (DreamTeamTonic's own already-scored totals, which bake in minutes but
  can't be reverse-engineered back out reliably). Xmins will use
  `gamesPlayed / team_games_played` as a season-wide start-rate proxy - the
  same shape as Dream Team's `compute_base_xmins_fraction`, just without its
  minutes-per-appearance refinement. This means the model can't distinguish
  "always starts and plays 90" from "always starts but subbed off at 60" -
  a real, documented gap, not a silent guess.
- **Live Odds layer is unpopulated for now.** The one real live-market
  source found (DreamTeamTonic's `fantasy-efl/tools/market-odds`) sits
  behind a £3.99/mth Premium paywall - confirmed by hitting a real paywall
  redirect when accessed without login. Per this project's own "never
  fabricate a number" rule, the layer simply stays `populated: false` and
  the other four layers renormalize over the real remaining weight, exactly
  like Dream Team already does for any fixture with no posted odds yet. A
  Premium-login scraper will be built once a real DreamTeamTonic Premium
  account exists to test against (the user's own account/credentials,
  stored in `.env`/GitHub Secrets - never a value typed into chat).
- **No cup competitions** - Fantasy EFL only scores "actual performances
  during the regular EFL season," confirmed from the official rules text.
  `fixtures`/`player_stats`/`club_stats` never need a competition value
  outside `championship`/`league_one`/`league_two`, and none of Dream
  Team's cup-rotation-xmins machinery has an equivalent here.
