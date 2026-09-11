-- The tunable core of the (planned, Phase 3) player projection model - same
-- shape and starting weights as dreamteam-projections' own layer_weights,
-- kept identical per position until real per-position calibration data
-- justifies splitting them. Xmins has no weight row - it gates the other
-- four rather than blending with them (see docs/data-and-weights.md).
create table layer_weights (
  id bigint generated always as identity primary key,
  horizon integer not null check (horizon in (1, 2, 3, 5)),
  position text not null check (position in ('GK', 'DEF', 'MID', 'FWD')),
  layer text not null check (layer in ('form', 'fixture_quantity', 'fixture_quality', 'live_odds')),
  weight numeric not null check (weight >= 0 and weight <= 1),
  updated_at timestamptz not null default now(),
  unique (horizon, position, layer)
);

insert into layer_weights (horizon, position, layer, weight)
select h.horizon, p.position, w.layer, w.weight
from (values (1), (2), (3), (5)) as h(horizon),
     (values ('GK'), ('DEF'), ('MID'), ('FWD')) as p(position),
     (values
        (1, 'live_odds', 0.50), (1, 'form', 0.20), (1, 'fixture_quality', 0.20), (1, 'fixture_quantity', 0.10),
        (2, 'live_odds', 0.30), (2, 'form', 0.20), (2, 'fixture_quality', 0.25), (2, 'fixture_quantity', 0.25),
        (3, 'live_odds', 0.15), (3, 'form', 0.20), (3, 'fixture_quality', 0.30), (3, 'fixture_quantity', 0.35),
        (5, 'live_odds', 0.10), (5, 'form', 0.15), (5, 'fixture_quality', 0.35), (5, 'fixture_quantity', 0.40)
     ) as w(horizon, layer, weight)
where w.horizon = h.horizon;

-- New vs. dreamteam-projections (no equivalent there): the club-pick side
-- of the model has no position dimension, so it's a separate, smaller
-- table rather than overloading `layer_weights` with a fake "CLUB"
-- position. Starting weights left equal to layer_weights' own horizon=1
-- split as a first guess - genuinely re-tunable via Phase 4's admin UI
-- once real club-projection accuracy data exists.
create table club_layer_weights (
  id bigint generated always as identity primary key,
  horizon integer not null check (horizon in (1, 2, 3, 5)),
  layer text not null check (layer in ('form', 'fixture_quantity', 'fixture_quality', 'live_odds')),
  weight numeric not null check (weight >= 0 and weight <= 1),
  updated_at timestamptz not null default now(),
  unique (horizon, layer)
);

insert into club_layer_weights (horizon, layer, weight) values
  (1, 'live_odds', 0.50), (1, 'form', 0.20), (1, 'fixture_quality', 0.20), (1, 'fixture_quantity', 0.10),
  (2, 'live_odds', 0.30), (2, 'form', 0.20), (2, 'fixture_quality', 0.25), (2, 'fixture_quantity', 0.25),
  (3, 'live_odds', 0.15), (3, 'form', 0.20), (3, 'fixture_quality', 0.30), (3, 'fixture_quantity', 0.35),
  (5, 'live_odds', 0.10), (5, 'form', 0.15), (5, 'fixture_quality', 0.35), (5, 'fixture_quantity', 0.40);

alter table layer_weights enable row level security;
alter table club_layer_weights enable row level security;
create policy "public read" on layer_weights for select using (true);
create policy "public read" on club_layer_weights for select using (true);
create policy "admin write" on layer_weights for all to authenticated using (true) with check (true);
create policy "admin write" on club_layer_weights for all to authenticated using (true) with check (true);
