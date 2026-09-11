# EFL Projections

A single-purpose fantasy football projections tool for **Fantasy EFL**
(efl.com's own official game - Championship, League One and League Two
together). Projects expected points per player per gameweek, priced through
Fantasy EFL's own real scoring rules, plus a parallel projection for the
2 club picks the game also scores (win/draw/away win/clean sheet/2+/4+
goals). See [`docs/data-and-weights.md`](docs/data-and-weights.md) for
exactly what data feeds what, and why.

This project intentionally does NOT cover any other fantasy game - see "Why
this is a separate project" below before adding one.

## Status

This section is the single source of truth for what's actually built vs.
planned. Update it every phase - a developer picking this up should be able
to read this section alone and know what's real.

- [x] Phase 0 - repo scaffold. `CLAUDE.md`, `docs/data-and-weights.md`,
      `.env.example`, `requirements.txt` in place, connected to a real
      Supabase project. Not yet deployed anywhere (Phase 6).
- [x] Phase 1 - database schema (15 migrations - see
      `supabase/migrations/`). Applied cleanly to the real Supabase project
      via `python scripts/run_migration.py`.
- [x] Phase 2 - data ingestion (free sources only). `scripts/refresh_efl.py`
      runs `seed_teams.py -> scrape_fixtures.py -> scrape_player_stats.py ->
      scrape_club_stats.py` end-to-end against DreamTeamTonic's real
      `fefl/*` API (see docs/data-and-weights.md for exact endpoints).
      **Verified against real data**: 72 real teams, 3570 real players,
      1656 real fixtures (552 x 3 divisions, 0 unresolved team names),
      21420 real `player_stats` rows and 432 real `club_stats` rows
      (season aggregate + 5 played gameweeks so far). Spot-checked the top
      5 season-aggregate players against DreamTeamTonic's own live tool
      page - exact match (Jack Marriott 52pts, Jack Fitzwater 45pts, etc).
      All four writes are batched with `psycopg2.extras.execute_values`
      (one round trip per ~3570-row response, not one per row) - the
      first, unbatched version of `scrape_player_stats.py` was genuinely
      too slow against the real hosted Supabase connection (the same
      per-row-query mistake dreamteam-projections documents hitting a
      37-minute CI timeout over), caught and fixed before it ever
      finished a real run, not after. Deliberately deferred, not silently
      dropped: a Premium-login market-odds scraper (DreamTeamTonic's
      `fantasy-efl/tools/market-odds` tool is Premium-gated, confirmed
      live) - build once a real `DREAMTEAMTONIC_EMAIL`/
      `DREAMTEAMTONIC_PASSWORD` exists to test against.
- [ ] Phase 3 - projection engine (player projections + a new club-projections
      engine). Not started - planned to reuse `compute_projections.py`'s
      batch-loading/renormalization patterns, minus the Bonus-PPM and
      cup-rotation machinery Fantasy EFL doesn't need (cup games don't score
      at all in this game).
- [ ] Phase 4 - admin settings UI (Scoring Rules, Club Scoring Rules, Layer
      Weights, Rating Anchors, Activity Log, Accuracy) - Accuracy admin-gated
      from the start this time, not moved there later.
- [ ] Phase 5 - public frontend (Projected Points, Fixture Forecast across 3
      divisions, XI Builder with 2 club picks and no budget, Club Picks, Top
      Picks, Compare, player pages) - reusing Hail Mary's existing navy/cyan
      design system from `dreamteam-projections/frontend`.
- [ ] Phase 6 - deployment (GitHub Actions cron + Vercel, live at
      `efl.hailmaryfantasysports.co.uk`).

## Why this is a separate project

Built as a sibling to `dreamteam-projections`, not a page bolted onto it.
Live research (browsing `fantasy.efl.com` and DreamTeamTonic's `fantasy-efl`
tools directly) found Fantasy EFL is a structurally different game, not
"Dream Team with different players":

- **No budget, no player prices, no transfer limit.** A squad is 7 players
  (1 GK, 2-3 DEF, 2-3 MID, 1-2 FWD, one of 3 fixed formations: 1-2-2-2 /
  1-2-3-1 / 1-3-2-1) plus **2 club picks** - clubs score their own points
  (win/draw/away win/clean sheet/2+ goals/4+ goals). Rebuildable from
  scratch every gameweek, free.
- Real scoring is mostly linear per-unit rates (same shape as Dream Team's
  `scoring_rules` table), except two genuinely tiered rules - appearance
  points (1-59min=+1 **or** 60+min=+2, mutually exclusive, not additive like
  Dream Team's) and a hat-trick bonus (3+ goals in a match = +5).
- **Cup competitions don't count at all** - only real regular-season EFL
  performances score. None of Dream Team's cup-rotation-xmins machinery
  applies here.
- Club-level scoring is genuinely new - Dream Team has no equivalent.

Per the established rule this whole product family already follows for
Dream Team ("every game gets its own DB, own route tree, own learning -
never a shared squad list or cross-game calibration"): nothing here shares a
database, deploy, or scoring model with `dreamteam-projections` or any other
Hail Mary game. Code *patterns* (migration conventions, the batch-loading
lesson, the admin save/audit pattern) are deliberately reused where they
still apply - see each phase's own notes for what's ported vs. new.

## Directory layout

```
scripts/            Python - data ingestion + (later) the projection engine
supabase/migrations/ Numbered SQL migrations, applied via scripts/run_migration.py
docs/                data-and-weights.md - the living record of what feeds what
frontend/            added in Phase 5
.github/workflows/   added in Phase 6
```

## Conventions

(Same discipline `dreamteam-projections` already follows - carried over
deliberately, not reinvented.)

- **Every non-obvious decision gets a code comment citing the real reason** -
  what request or real finding caused it, what alternative was rejected and
  why.
- **Never fabricate a number.** If a signal genuinely isn't available yet
  (no raw per-match minutes in the free data, live odds not posted/not
  subscribed to yet), the field stays `null` and downstream weighting
  renormalizes over what's actually present - never a guessed fallback
  presented as real.
- Migrations are numbered, forward-only, one concern per file.
- Scripts load `.env` via `scripts/env_utils.py`'s `load_env()` and connect
  with `psycopg2` directly against `DATABASE_URL` - never through the
  Supabase REST/anon client (that's for the frontend only, once it exists).

## Real data sources (Phase 2)

All free, no login, on the same `dtt-data-api-259295136071.europe-west2.run.app`
backend `dreamteam-projections`'s own scraper already talks to (different
namespace - `fefl` here, `sdt` there):

| Endpoint | Gives | Feeds |
|---|---|---|
| `fefl/squads?season=202627&competition={championship\|league-one\|league-two}` | All 72 real clubs: `squadId`, `name`, `shortName`, `abbreviation`, official `fdrHome`/`fdrAway`, `leaguePosition`, badge/colours | `teams` |
| `storage.googleapis.com/dttfixturelists/fefl-{championship\|league-one\|league-two}Fixtures.json` | Real fixtures per division: team names, real `gw`, `timestamp`, `score`, `status` - static JSON, no scraping needed | `fixtures` |
| `fefl/overall-stats-by-gw?fromGW=N&toGW=N&season=202627` | Real per-gameweek (or season-aggregate) stats for all ~3570 players: identity, position, squad, goals/assists/keyPasses/shotsOnTarget/cleanSheets/clearances/blocks/tackles/interceptions/saves/goalsConceded, `percentSelected`, status/injury/suspension, DTT's own real `totalPoints` | `players`, `player_stats` |
| `fefl/club-stats-by-gw?fromGW=N&toGW=N&season=202627` | Real per-club per-gameweek: cleanSheets, goalsScored/goalsConceded, twoGoalGames, real league table columns, DTT's own real club `totalPoints` | `club_stats` |
| `fefl/current-gameweek?season=202627` | `{currentGameweek, totalGameweeks, totalGameweeksWithPlayoffs}` - one global number | gameweek resolution |

**Confirmed gaps** (documented, not silently worked around):
- No raw per-match minutes field anywhere in the free data - only
  `gamesPlayed`. Xmins will use a season-wide appearance-rate proxy
  (`gamesPlayed / team_games_played`) until/unless a minutes source exists.
- DreamTeamTonic's `fantasy-efl/tools/market-odds` tool (live win/draw/clean
  sheet bookmaker odds) is Premium-gated - confirmed by hitting a paywall
  redirect. The Live Odds layer stays unpopulated (renormalizes away, same
  as any missing layer) until a real Premium login exists to scrape it.

## Running locally

- Python pipeline: `python scripts/<name>.py` from the repo root, with
  `.env` populated (see `.env.example`) - every script loads it via
  `scripts/env_utils.py`.
- Migrations: `python scripts/run_migration.py` applies every file in
  `supabase/migrations/` that hasn't run yet.
- Full ingestion pipeline: `python scripts/refresh_efl.py` (runs
  `seed_teams -> scrape_fixtures -> scrape_player_stats -> scrape_club_stats`
  in that order - each step's failure is logged but doesn't block the rest).
