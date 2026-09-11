-- The two Fantasy EFL scoring rules that are genuinely tiered, not a flat
-- per-unit rate, so they don't fit scoring_rules' shape (migration 0005).
-- Reuses the exact tiered-lookup table shape dreamteam-projections already
-- proved out for its own bonus_tiers/pass_completion_tiers (that
-- project's migration 0019) - same pattern, different real numbers.
--
-- appearance_points_tiers: real rule is "Appearance (up to 59 minutes) =
-- +1" OR "Appearance (60+ minutes) = +2" - mutually exclusive tiers of one
-- category (NOT additive like dreamteam-projections' own appearance +
-- minutes_60_plus rows, which really do both apply there). min_minutes=0
-- covers "didn't play" (0 points, implicit - no row needed, but included
-- for an explicit floor).
create table appearance_points_tiers (
  id bigint generated always as identity primary key,
  min_minutes integer not null unique,
  points numeric not null
);

insert into appearance_points_tiers (min_minutes, points) values (0, 0), (1, 1), (60, 2);

-- hat_trick_bonus_tiers: +5 for 3 or more real goals in a single match, on
-- TOP of the normal per-goal points already priced in scoring_rules - a
-- bonus, not a replacement.
create table hat_trick_bonus_tiers (
  id bigint generated always as identity primary key,
  min_goals integer not null unique,
  points numeric not null
);

insert into hat_trick_bonus_tiers (min_goals, points) values (0, 0), (3, 5);

alter table appearance_points_tiers enable row level security;
alter table hat_trick_bonus_tiers enable row level security;
create policy "public read" on appearance_points_tiers for select using (true);
create policy "public read" on hat_trick_bonus_tiers for select using (true);
create policy "admin write" on appearance_points_tiers for all to authenticated using (true) with check (true);
create policy "admin write" on hat_trick_bonus_tiers for all to authenticated using (true) with check (true);
