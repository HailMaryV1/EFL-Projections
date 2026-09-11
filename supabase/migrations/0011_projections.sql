-- The (Phase 3) engine's real output for players: one row per (player,
-- gameweek, horizon, algorithm version). Same shape as dreamteam-
-- projections' own projections table, minus boom_probability/sim_floor/
-- sim_ceiling (Monte Carlo simulation) - deliberately cut from v1 scope to
-- keep the first real engine simpler; can be added the same way Dream
-- Team's own migration 0020 added it later, if wanted.
create table projections (
  id bigint generated always as identity primary key,
  player_id bigint not null references players(id) on delete cascade,
  gameweek integer not null,
  horizon integer not null check (horizon in (1, 2, 3, 5)),
  algorithm_version_id bigint not null references algorithm_versions(id),
  total_points numeric not null,
  rating numeric,
  -- { "goal": {"expected_count": 0.12, "points": 0.72, ...}, "assist": {...}, ... }
  per_stat jsonb not null,
  -- { "xmins": {"value": 0.8, "populated": true}, "form": {"weight": 0.2, "value": 4.1, "populated": true}, ... "live_odds": {"populated": false} }
  per_layer jsonb not null,
  data_confidence numeric,
  created_at timestamptz not null default now(),
  unique (player_id, gameweek, horizon, algorithm_version_id)
);

create index on projections (player_id, gameweek);
create index on projections (gameweek, horizon);

alter table projections enable row level security;
create policy "public read" on projections for select using (true);
