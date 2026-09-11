-- New vs. dreamteam-projections (no equivalent there): the (Phase 3) club-
-- projections engine's real output, parallel to `projections` but keyed by
-- team_id and priced through club_scoring_rules/club_layer_weights instead
-- of scoring_rules/layer_weights.
create table club_projections (
  id bigint generated always as identity primary key,
  team_id bigint not null references teams(id) on delete cascade,
  gameweek integer not null,
  horizon integer not null check (horizon in (1, 2, 3, 5)),
  algorithm_version_id bigint not null references algorithm_versions(id),
  total_points numeric not null,
  -- { "win": {"probability": 0.42, "points": 2.1}, "clean_sheet": {...}, ... }
  per_stat jsonb not null,
  per_layer jsonb not null,
  data_confidence numeric,
  created_at timestamptz not null default now(),
  unique (team_id, gameweek, horizon, algorithm_version_id)
);

create index on club_projections (team_id, gameweek);
create index on club_projections (gameweek, horizon);

alter table club_projections enable row level security;
create policy "public read" on club_projections for select using (true);
