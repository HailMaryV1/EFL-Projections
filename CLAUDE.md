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
- [x] Phase 2 - data ingestion. **Real mid-build pivot** (see
      docs/data-and-weights.md's own "Real pivot" section for the full
      story): first shipped against DreamTeamTonic's `fefl/*` API, verified
      against real row counts - then, while building Phase 3, a direct
      live check found every per-event stat field on that API (goals,
      assists, tackles, etc.) was a genuine zero for all 3570 real
      players, not a scraper bug. The whole pipeline was rebuilt around
      `fantasy.efl.com`'s own real JSON instead (`json/fantasy/squads.json`
      /`players.json`/`rounds.json`/`competitions.json`) - free,
      unauthenticated, and genuinely real (spot-checked exact matches: Jack
      Fitzwater real goals=2/clearances=77/blocks=10/tackles=10/
      cleanSheets=2/totalPoints=55). `scripts/refresh_efl.py` runs
      `seed_teams.py -> scrape_fixtures.py -> scrape_player_stats.py ->
      scrape_club_stats.py` end-to-end. **Verified against real data**: 72
      teams, 3570 players, 1656 fixtures (0 unresolved), real per-round
      goal/assist/card/own-goal/missed-penalty rows derived from real
      match events (`rounds.json`), real per-club win/draw/loss/goals
      records derived from real match results. Every write batched with
      `psycopg2.extras.execute_values` - an early unbatched version of
      `scrape_player_stats.py` was already too slow against the real
      hosted Supabase connection (the same per-row-query mistake
      dreamteam-projections documents hitting a 37-minute CI timeout
      over), caught and fixed before it ever finished a run. Deliberately
      deferred, not silently dropped: a Premium-login market-odds scraper
      (DreamTeamTonic's `fantasy-efl/tools/market-odds` tool is
      Premium-gated, confirmed live) - build once a real
      `DREAMTEAMTONIC_EMAIL`/`DREAMTEAMTONIC_PASSWORD` exists to test
      against.
- [x] Phase 3 - projection engine. `scripts/compute_player_projections.py`
      (real per-fixture expected counts for every priced stat, summed
      across a horizon, gated by Xmins, FDR-adjusted) and
      `scripts/compute_club_projections.py` (real win/draw/away-win/
      clean-sheet/2+/4+-goals expected counts via an independent-Poisson
      scoreline model on each club's own real attack/defense strength).
      **Verified against real data**: 14280 real player projections (3570
      players x 4 horizons) and 288 real club projections (72 clubs x 4
      horizons) written for the real current gameweek, real differentiated
      per-stat breakdowns confirmed (e.g. a real forward's top contributors
      were goal/shot_on_target/assist in sensible real proportions, not a
      flat appearance-points-only number). `rating` stays `null` (Phase 4
      hasn't built the anchor-calibration action yet - `rating_anchors`
      starts empty by design, same as Dream Team). No Monte Carlo
      simulation in this v1 (deliberately cut from scope - see migration
      `0011`'s own comment).
- [x] Phase 4 - admin settings UI. `frontend/` scaffolded (Next.js 16 /
      React 19 / Tailwind 4, same conventions as `dreamteam-projections/
      frontend`) with Supabase-Auth-gated `/admin` (`proxy.ts` redirects an
      unauthenticated visitor; `admin/layout.tsx` re-checks server-side).
      Six real panels: Scoring Rules (+ the two tiered tables in a compact
      section on the same page), Club Scoring Rules (new), Layer Weights,
      Club Layer Weights (new, no position dimension), Rating Anchors
      (with a real "recalibrate from today's real data" action - directly
      portable from Dream Team's version since the schema matches
      exactly), Activity Log. Every save writes `activity_log` and bumps
      `algorithm_versions` (`lib/adminHelpers.ts`, adapted for this
      project's own real tables). **Verified**: typecheck clean; `/admin`
      confirmed redirecting to `/login` when signed out; every admin
      table's real row counts confirmed directly against the database
      (scoring_rules=23, club_scoring_rules=6, layer_weights=64,
      club_layer_weights=16, appearance_points_tiers=3,
      hat_trick_bonus_tiers=2, activity_log=72 real `team_added` events
      from Phase 2). **Not yet verified signed-in** - needs a real
      Supabase Auth user for this project (Authentication → Users → Add
      User in the Supabase dashboard - the user's own account/password,
      never entered by Claude).
      **2026-09-12 - freeze/capture pipeline + Accuracy page built.**
      `scripts/freeze_predictions.py`/`freeze_club_predictions.py` (new)
      snapshot each gameweek's real horizon=1 `projections`/
      `club_projections` row into `predictions_and_actuals`/
      `club_predictions_and_actuals` once, permanently (`on conflict do
      nothing`); `scripts/capture_actuals.py`/`capture_club_actuals.py`
      (new) fill in the real result from `player_stats`/`club_stats` once
      every real fixture for that player's/club's team in that gameweek
      has a `kickoff_at` already in the past. Simpler than Dream Team's
      versions on purpose, matching this project's own schema: no
      `predicted_xmins_fraction`/`predicted_fixture_count`/clean-sheet-
      expected columns exist here (migration 0013 is the original,
      simpler shape - PL's later 0021/0022 columns have no EFL
      equivalent), and `player_stats` has no raw per-match minutes field
      at all (only `games_played`, a 0/1 flag) - so `actual_minutes`
      stays permanently `null` here, never backfilled from a proxy. No
      cup-leg gating needed either - this project's `fixtures` table has
      no cup-competition concept, so the fixture gate is a plain "every
      real fixture for that team this gameweek has kicked off" check.
      Wired into `.github/workflows/refresh_efl.yml` after both compute
      steps. **Verified against real data**: `freeze_predictions.py`
      froze 3570 new rows (one per real player, GW5 - the real current
      gameweek per `resolve_current_gameweek`), `freeze_club_predictions.py`
      froze 72; `capture_actuals.py` captured 147 real results (3423 still
      pending), `capture_club_actuals.py` captured 4 (68 still pending) -
      correctly partial, not a bug: GW5's real fixtures span
      2026-09-10 to 2026-09-15, and this was run 2026-09-12, so only the
      teams whose GW5 game had already kicked off got a real captured
      result. New `app/admin/accuracy/page.tsx` (+ `lib/accuracyMetrics.ts`,
      only the pure-math functions genuinely reusable from Dream Team's
      version - no baseline comparison/minutes-band/cup diagnostics,
      since none of those are supportable by this project's real schema)
      shows headline MAE/median-AE/RMSE/bias/error-buckets, a GK/DEF/MID/
      FWD position breakdown, and a per-gameweek predicted-vs-actual
      table, for both players and clubs, range-paginated past
      PostgREST's 1000-row cap from day one (confirmed live against the
      real DB: the player summary/detail queries return real nested
      `players`/`teams` join objects, not arrays, matching the page's own
      types). "Accuracy" added to the admin nav. **Verified**: clean
      `tsc --noEmit`/`eslint`/`npm run build` (`/admin/accuracy` in the
      route list), the four scripts' real row counts above pulled
      directly from the live Supabase database via `env_utils.db_connect()`,
      not inferred.
- [x] Phase 5 - public frontend. Real navy/cyan Hail Mary identity, same
      component conventions as `dreamteam-projections/frontend` (adapted,
      not copy-pasted - `TeamBadge` reads real colours straight off
      `teams.background_color`/`text_color`/`abbreviation` instead of a
      hand-maintained 20-club map, since fantasy.efl.com's own data already
      gives real colours for all 72 real clubs). Six real pages:
      - `/projected-points` - every real player, sortable/filterable, no
        price/value columns (no budget exists) - real ownership%, season
        points, rating, fixtures.
      - `/fixtures` - real win/draw/loss/clean-sheet/2+-goals forecast per
        division, read from `club_projections`' own real per-fixture
        breakdown (added this phase - `project_club_stats` now stores a
        `per_stat.fixtures` array, not just summed horizon totals).
      - `/best-squad` - the real 7-player + 2-club Fantasy EFL pick,
        genuinely combined into one tool (not two separate ones like Dream
        Team's XI/Club-picks split) - `lib/squadBuilder.ts` is a real,
        documented greedy heuristic (no budget to trade off, just a
        max-2-per-club cap), formation tabs for all 3 real formations.
      - `/top-picks` - shareable Top 5 card, downloadable via
        `html-to-image` (ported from Dream Team's own pattern).
      - `/compare` - Player Face-Off, real per-horizon/season/ownership
        comparison (no radar chart in this v1 - simpler bar rows instead).
      - `/players/[id]` - full real per-stat/per-layer explainability,
        read directly from the engine's own stored breakdown.
      **Real bugs found and fixed live, not after**: (1) every unbounded
      player-pool query hit PostgREST's real 1000-row cap (confirmed live:
      Projected Points showed "1000 of 1000" instead of the real 3570) -
      `lib/supabasePaginate.ts`'s `fetchAllRows` now range-paginates every
      such query, the same lesson `dreamteam-projections` already
      documents having to learn once. (2) `lib/comparePlayer.ts` queried
      `algorithm_versions` directly for "latest," which can belong to
      whichever of the two engines (player/club) happened to run last
      since they share one version-numbering table - fixed to always read
      the latest id actually present on the table being queried, the
      pattern every other page already used correctly. **Verified**:
      clean typecheck and lint, every page checked live against real data
      (including a real max-2-per-club Best Squad result and a real
      Fixture Forecast with real win/draw/loss percentages), mobile
      layout checked on Projected Points (table -> card breakpoint, no
      horizontal overflow).
- [ ] Phase 6 - deployment. `.github/workflows/refresh_efl.yml` written
      (6-hourly cron + `workflow_dispatch`, no Playwright install step
      needed - every real source is plain `fantasy.efl.com` JSON). Admin
      overview's "Recompute now" button wired to it
      (`app/admin/RecomputeButton.tsx` + `triggerRecompute` in
      `app/admin/actions.ts`), same pattern as dreamteam-projections.
      **Not yet live** - needs the one-time human setup below, and hasn't
      had a real end-to-end CI run yet.

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
scripts/            Python - data ingestion + the projection engine
supabase/migrations/ Numbered SQL migrations, applied via scripts/run_migration.py
docs/                data-and-weights.md - the living record of what feeds what
frontend/            Next.js 16 / React 19 / Tailwind 4 - admin settings + the public tool suite
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

## Real data sources

All free, unauthenticated, on `fantasy.efl.com`'s own static JSON - the
official game's own data, not a third-party mirror (see Phase 2's own
Status entry above for why this replaced an earlier DreamTeamTonic-based
version mid-build).

| Source | Gives | Feeds |
|---|---|---|
| `fantasy.efl.com/json/fantasy/competitions.json` | Real competitionId -> division mapping (10/11/12) | Every script's competition resolution |
| `fantasy.efl.com/json/fantasy/squads.json` | All 72 real clubs: `id`, `name`, `shortName`, `abbreviation`, official `fdrHome`/`fdrAway`, `leaguePosition`, badge/colours | `teams` |
| `fantasy.efl.com/json/fantasy/rounds.json` | All 42 real gameweeks: real `games` (home/away, score, status) AND real per-game `events` (Goal/YellowCard/RedCard/OwnGoal/Penalty, with playerId/minute/assistPlayerId) | `fixtures`; real per-round `player_stats`/`club_stats` |
| `fantasy.efl.com/json/fantasy/players.json` | Real season-aggregate stats for ~3570 players: identity, position, squad, real goalsScored/assists/keyPasses/shotsOnTarget/cleanSheets/clearances/blocks/tackles/interceptions/saves/appearances, `percentSelected`, status/injury/suspension, real `totalPoints` | `players`, season-aggregate `player_stats` |

**Confirmed gaps** (documented, not silently worked around - full detail in
docs/data-and-weights.md's "Known limitations"):
- No raw per-match minutes field - only `appearances`. Xmins uses a
  season-wide appearance-rate proxy.
- No real per-round "did this player play" flag - only real per-round
  scoring/carded events. Form's exposure model adapts around this (see
  docs/data-and-weights.md).
- No real per-player goals-conceded or penalty-save attribution - priced
  from team-level data / left unpriced respectively.
- DreamTeamTonic's `fantasy-efl/tools/market-odds` tool (live win/draw/clean
  sheet bookmaker odds) is Premium-gated - confirmed by hitting a paywall
  redirect. The Live Odds layer stays unpopulated (renormalizes away, same
  as any missing layer) until a real Premium login exists to scrape it -
  both Poisson-style models (player goal-scoring, club scorelines) run on
  real historical goals + official FDR instead for now.

## Running locally

- Python pipeline: `python scripts/<name>.py` from the repo root, with
  `.env` populated (see `.env.example`) - every script loads it via
  `scripts/env_utils.py`.
- Migrations: `python scripts/run_migration.py` applies every file in
  `supabase/migrations/` that hasn't run yet.
- Full ingestion pipeline: `python scripts/refresh_efl.py` (runs
  `seed_teams -> scrape_fixtures -> scrape_player_stats -> scrape_club_stats`
  in that order - each step's failure is logged but doesn't block the rest).
- Projection engine (run after ingestion, not part of `refresh_efl.py`):
  `python scripts/compute_player_projections.py` and
  `python scripts/compute_club_projections.py`.
- Frontend: `cd frontend && npm run dev`, with `frontend/.env.local`
  populated (see `frontend/.env.example`). To sign into `/admin` locally,
  create a real Supabase Auth user first: Supabase dashboard →
  Authentication → Users → Add User (your own email/password - never
  something to ask an AI assistant to type in for you).

## Deployment setup (one-time, needs a human)

Same two real steps as dreamteam-projections needed - neither is
something an AI assistant should do on your behalf (a repo secret and a
personal access token are both real credentials).

1. **GitHub Actions secret** - `.github/workflows/refresh_efl.yml` needs a
   `DATABASE_URL` repo secret before it can run: GitHub repo (`HailMaryV1/
   EFL-Projections`) → Settings → Secrets and variables → Actions → "New
   repository secret", name `DATABASE_URL`, value = the same real
   connection string already in your local `.env`.
2. **Recompute-now token** - the admin overview page's "Recompute now"
   button calls GitHub's `workflow_dispatch` API directly, which needs a
   real token with Actions write access on this repo: GitHub → Settings
   (account, not repo) → Developer settings → Personal access tokens →
   Fine-grained tokens → "Generate new token", scope it to just the
   `EFL-Projections` repository, grant "Actions: Read and write"
   repository permission, generate, copy the token (shown once). Add it
   as `GITHUB_ACTIONS_TOKEN` in `frontend/.env.local` (local dev) and in
   Vercel's project env vars (production) - never `NEXT_PUBLIC_`,
   server-only.
3. **Vercel project** - new project, import the `HailMaryV1/EFL-
   Projections` GitHub repo, set **Root Directory** to `frontend` (the
   Next.js app doesn't live at the repo root - the exact same setting
   that broke once during hailmary-hub's own deployment when it was left
   pointing at a stale value). Environment variables:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `GITHUB_ACTIONS_TOKEN` (from step 2) -
   same real values as `frontend/.env.local`. `SITE_PASSWORD` is optional
   (Basic Auth in front of the whole site, a no-op if unset).
4. **Domain** - add `efl.hailmaryfantasysports.co.uk` as a custom domain
   on the new Vercel project, then add the DNS record Vercel shows you
   wherever `hailmaryfantasysports.co.uk`'s other real subdomains
   (`dreamteam.*`) are already managed.
