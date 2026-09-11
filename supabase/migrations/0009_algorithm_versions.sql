-- Versioned snapshot of the full weight configuration every time it
-- changes, so a past projection stays attributable to the exact weights
-- that produced it. Same shape as dreamteam-projections' own
-- algorithm_versions table - shared by both the player and club engines
-- (Phase 3), one version numbering scheme for the whole project.
create table algorithm_versions (
  id bigint generated always as identity primary key,
  revision integer not null,
  weights jsonb not null,
  created_at timestamptz not null default now(),
  created_by text,
  note text,
  unique (revision)
);

alter table algorithm_versions enable row level security;
create policy "public read" on algorithm_versions for select using (true);
create policy "admin write" on algorithm_versions for all to authenticated using (true) with check (true);
