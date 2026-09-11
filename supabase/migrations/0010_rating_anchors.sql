-- Real, measured control points for mapping each content layer's raw value
-- onto the 1-10 absolute rating scale - same shape and same "starts EMPTY
-- on purpose" convention as dreamteam-projections' own rating_anchors.
-- Until a real calibration pass measures this project's own distribution
-- (a future admin "recalibrate from today's real data" action), a layer
-- with no anchors here contributes no rating.
create table rating_anchors (
  id bigint generated always as identity primary key,
  horizon integer not null check (horizon in (1, 2, 3, 5)),
  position text not null check (position in ('GK', 'DEF', 'MID', 'FWD')),
  layer text not null check (layer in ('form', 'fixture_quantity', 'fixture_quality', 'live_odds')),
  -- [[raw_value, rating], ...] sorted ascending by raw_value, rating in 1-10.
  anchors jsonb not null,
  updated_at timestamptz not null default now(),
  unique (horizon, position, layer)
);

alter table rating_anchors enable row level security;
create policy "public read" on rating_anchors for select using (true);
create policy "admin write" on rating_anchors for all to authenticated using (true) with check (true);
