-- Real club-pick scoring, from fantasy.efl.com's own official Game
-- Guidelines. New vs. dreamteam-projections - Dream Team has no club-pick
-- mechanic at all. away_win only applies to a picked club when it was the
-- away side and won (on top of the flat 'win' points, per the real rules
-- text: "Win +5 / Draw +3 / Away win +2").
create table club_scoring_rules (
  id bigint generated always as identity primary key,
  stat text not null unique,
  points numeric not null,
  notes text
);

insert into club_scoring_rules (stat, points, notes) values
  ('win', 5, null),
  ('draw', 3, null),
  ('away_win', 2, 'additional to the flat win points, only when the picked club was the away side'),
  ('clean_sheet', 2, null),
  ('two_plus_goals', 2, null),
  ('four_plus_goals', 2, null);

alter table club_scoring_rules enable row level security;
create policy "public read" on club_scoring_rules for select using (true);
create policy "admin write" on club_scoring_rules for all to authenticated using (true) with check (true);
