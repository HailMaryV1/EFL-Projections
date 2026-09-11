-- New vs. dreamteam-projections (no equivalent there): same frozen-
-- snapshot-plus-actual shape as predictions_and_actuals, for the club
-- picks side.
create table club_predictions_and_actuals (
  id bigint generated always as identity primary key,
  team_id bigint not null references teams(id) on delete cascade,
  gameweek integer not null,
  predicted_points numeric not null,
  frozen_at timestamptz not null default now(),
  actual_points numeric,
  actual_captured_at timestamptz,
  unique (team_id, gameweek)
);

create index on club_predictions_and_actuals (gameweek);

alter table club_predictions_and_actuals enable row level security;
create policy "public read" on club_predictions_and_actuals for select using (true);
