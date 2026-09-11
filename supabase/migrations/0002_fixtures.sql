-- Real fixtures across all 3 divisions. No cup/European competitions and
-- no TBA/IF placeholder table like dreamteam-projections needs - Fantasy
-- EFL only scores "actual performances during the regular EFL season"
-- (confirmed from the official rules), so cup legs never need modelling
-- here at all.
create table fixtures (
  id bigint generated always as identity primary key,
  competition text not null check (competition in ('championship', 'league_one', 'league_two')),
  home_team_id bigint not null references teams(id),
  away_team_id bigint not null references teams(id),
  kickoff_at timestamptz not null,
  gameweek integer not null,
  home_score integer,
  away_score integer,
  status text,
  created_at timestamptz not null default now(),
  unique (home_team_id, away_team_id, gameweek)
);

create index on fixtures (gameweek);
create index on fixtures (kickoff_at);

alter table fixtures enable row level security;
create policy "public read" on fixtures for select using (true);
