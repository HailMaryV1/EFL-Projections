-- Core identity tables: teams (all 72 real Championship/League One/League
-- Two clubs) and players (one row per real person).
--
-- Unlike dreamteam-projections, no team_aliases table and no
-- pending_team_id/debounced-team-change handling: every real data source
-- this project uses (fefl/squads, fefl/overall-stats-by-gw,
-- fefl/club-stats-by-gw, the static fixture JSONs) comes from the SAME
-- DreamTeamTonic backend and shares stable ids (squadId/playerId), so
-- there's no cross-source name-matching problem to solve up front. If a
-- real mismatch ever turns up (see docs/data-and-weights.md),
-- dreamteam-projections/scripts/name_matching.py's resolver is available
-- to port over - not needed yet.
--
-- No price/budget columns either - Fantasy EFL has no player prices at
-- all (see CLAUDE.md "Why this is a separate project").

create table teams (
  id bigint generated always as identity primary key,
  -- DreamTeamTonic's own real squadId - stable across every one of their
  -- fefl/* endpoints, so this is the live-sync key (not name matching).
  external_id text not null unique,
  name text not null,
  short_name text,
  abbreviation text,
  competition text not null check (competition in ('championship', 'league_one', 'league_two')),
  badge_url text,
  background_color text,
  text_color text,
  league_position integer,
  created_at timestamptz not null default now()
);

create index on teams (competition);

create table players (
  id bigint generated always as identity primary key,
  -- DreamTeamTonic's own real playerId - stable across every fefl/*
  -- endpoint that returns player rows.
  external_id text not null unique,
  full_name text not null,
  first_name text,
  last_name text,
  team_id bigint references teams(id),
  position text check (position in ('GK', 'DEF', 'MID', 'FWD')),
  ownership_pct numeric,
  -- Real values straight from fefl/overall-stats-by-gw: status is e.g.
  -- "playing"; injury_status/injury_type/suspension_detail are null unless
  -- genuinely flagged - never guessed when null.
  status text,
  injury_status text,
  injury_type text,
  suspension_detail text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on players (team_id);
create index on players (is_active);

alter table teams enable row level security;
alter table players enable row level security;

create policy "public read" on teams for select using (true);
create policy "public read" on players for select using (true);
