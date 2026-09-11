-- Generic audit trail: who/what changed, when, before/after. Every
-- settings save (Phase 4) will write here, as will the import pipeline's
-- own notable events (unresolved team-name lookups, etc.). Same shape as
-- dreamteam-projections' own activity_log, already enriched with the
-- indexed player_id/fixture_id/summary columns from day one (that project
-- had to add these in a later migration - baked in from the start here).
create table activity_log (
  id bigint generated always as identity primary key,
  event_type text not null,
  actor text,
  summary text,
  player_id bigint references players(id),
  fixture_id bigint references fixtures(id),
  details jsonb,
  created_at timestamptz not null default now()
);

create index on activity_log (event_type, created_at desc);
create index on activity_log (player_id);

alter table activity_log enable row level security;
create policy "public read" on activity_log for select using (true);
