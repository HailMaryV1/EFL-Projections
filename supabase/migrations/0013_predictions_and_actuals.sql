-- Frozen per-gameweek player prediction snapshot (what the engine said
-- BEFORE kickoff) plus the real actual result once played - same append-
-- only shape as dreamteam-projections' own predictions_and_actuals, the
-- pair this project's own future accuracy tracking reads from.
create table predictions_and_actuals (
  id bigint generated always as identity primary key,
  player_id bigint not null references players(id) on delete cascade,
  gameweek integer not null,
  predicted_points numeric not null,
  predicted_rating numeric,
  frozen_at timestamptz not null default now(),
  actual_points numeric,
  actual_minutes integer,
  actual_captured_at timestamptz,
  unique (player_id, gameweek)
);

create index on predictions_and_actuals (gameweek);

alter table predictions_and_actuals enable row level security;
create policy "public read" on predictions_and_actuals for select using (true);
