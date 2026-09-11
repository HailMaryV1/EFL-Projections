-- Per-player, per-gameweek real stats (gameweek null = season-cumulative
-- row, fromGW=1&toGW=39). Columns cover every stat Fantasy EFL's real
-- scoring rules (migration 0005) price directly - unlike dreamteam-
-- projections, no raw_stats jsonb catch-all is needed for a synthetic
-- bonus-points system, since these ARE the priced stats already (see
-- docs/data-and-weights.md "Scoring model"). raw_stats is kept anyway for
-- forward compatibility (e.g. if a later source adds fields not priced
-- yet) but starts unused.
create table player_stats (
  id bigint generated always as identity primary key,
  player_id bigint not null references players(id) on delete cascade,
  season text not null,
  gameweek integer,
  games_played integer,
  goals integer,
  assists integer,
  key_passes integer,
  shots_on_target integer,
  clean_sheets integer,
  clearances integer,
  blocks integer,
  tackles integer,
  interceptions integer,
  saves integer,
  goals_conceded integer,
  total_points numeric,
  raw_stats jsonb,
  created_at timestamptz not null default now(),
  unique (player_id, season, gameweek)
);

create index on player_stats (player_id, season);

-- Real bug dreamteam-projections hit and fixed after the fact (its own
-- migration 0017): a plain unique(player_id, season, gameweek) constraint
-- never deduplicates the season-aggregate rows (gameweek IS NULL), because
-- Postgres treats every NULL as distinct. Baked in from day one here
-- instead of waiting to hit the same bug.
create unique index player_stats_season_aggregate_key on player_stats (player_id, season) where gameweek is null;

alter table player_stats enable row level security;
create policy "public read" on player_stats for select using (true);
