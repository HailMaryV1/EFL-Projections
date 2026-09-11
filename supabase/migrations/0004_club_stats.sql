-- New vs. dreamteam-projections (no equivalent there): per-club, per-
-- gameweek real stats feeding the club-pick side of Fantasy EFL's scoring
-- (win/draw/away win/clean sheet/2+/4+ goals - see club_scoring_rules,
-- migration 0007). Same gameweek-null-means-season-aggregate shape as
-- player_stats, including the same partial-unique-index fix from day one.
create table club_stats (
  id bigint generated always as identity primary key,
  team_id bigint not null references teams(id) on delete cascade,
  season text not null,
  gameweek integer,
  games_played integer,
  clean_sheets integer,
  goals_scored integer,
  goals_conceded integer,
  two_plus_goal_games integer,
  -- fefl/club-stats-by-gw has no real "4+ goal games" field (only
  -- twoGoalGames) - stays null until Phase 2 execution confirms whether a
  -- per-fixture score breakdown exists elsewhere to derive it from real
  -- data, or the engine has to leave that scoring line unpriced. Never
  -- fabricated in the meantime.
  four_plus_goal_games integer,
  -- Real EFL league-table columns (from fefl/club-stats-by-gw) - useful
  -- signal for the future club-projections engine (form/strength), not
  -- itself part of Fantasy EFL's scoring.
  league_points integer,
  league_position integer,
  league_goals_for integer,
  league_goals_against integer,
  total_points numeric,
  created_at timestamptz not null default now(),
  unique (team_id, season, gameweek)
);

create index on club_stats (team_id, season);
create unique index club_stats_season_aggregate_key on club_stats (team_id, season) where gameweek is null;

alter table club_stats enable row level security;
create policy "public read" on club_stats for select using (true);
