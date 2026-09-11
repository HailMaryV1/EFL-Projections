-- Fantasy EFL's real scoring matrix, from fantasy.efl.com's own official
-- Game Guidelines (read in full and quoted verbatim during planning).
-- Same shape as dreamteam-projections' scoring_rules table - every "every
-- N of X = Y points" rule here IS linear per-unit (Y/N), same convention
-- as that project's own 'save'/'tackle' rows.
--
-- Two real rules are genuinely NOT linear and are NOT rows here - see
-- migration 0006_tiered_scoring.sql: appearance points (1-59min=+1 OR
-- 60+min=+2, mutually exclusive tiers) and the hat-trick bonus (3+ goals
-- in a match = +5, on top of normal per-goal points).
create table scoring_rules (
  id bigint generated always as identity primary key,
  applies_to text not null,  -- 'all', 'GK', 'DEF', 'MID', 'FWD'
  stat text not null,
  points numeric not null,
  notes text,
  unique (applies_to, stat)
);

insert into scoring_rules (applies_to, stat, points, notes) values
  ('all', 'assist', 3, null),
  ('all', 'missed_penalty', -3, null),
  ('all', 'own_goal', -3, null),
  ('all', 'yellow_card', -1, null),
  ('all', 'red_card', -3, 'goals conceded after a red card still count toward clean-sheet loss / goals-conceded penalties'),
  ('GK', 'save', 0.667, 'every 3 saves = +2'),
  ('GK', 'penalty_save', 5, null),
  ('GK', 'goal', 10, 'excl. own goals'),
  ('GK', 'clean_sheet_60min', 5, 'must have played 60+ minutes'),
  ('GK', 'goals_conceded_per_2', -0.5, 'every 2 goals conceded = -1'),
  ('DEF', 'clearance', 0.25, 'every 4 clearances = +1'),
  ('DEF', 'block', 0.5, 'every 2 blocks = +1'),
  ('DEF', 'tackle', 0.5, 'every 2 tackles = +1'),
  ('DEF', 'goal', 7, 'excl. own goals'),
  ('DEF', 'clean_sheet_60min', 5, 'must have played 60+ minutes'),
  ('DEF', 'goals_conceded_per_2', -0.5, 'every 2 goals conceded = -1'),
  ('MID', 'interception', 2, null),
  ('MID', 'goal', 6, 'excl. own goals'),
  ('MID', 'key_pass', 0.5, 'every 2 key passes = +1'),
  ('MID', 'shot_on_target', 1, null),
  ('FWD', 'goal', 5, 'excl. own goals'),
  ('FWD', 'key_pass', 0.5, 'every 2 key passes = +1'),
  ('FWD', 'shot_on_target', 1, null);

alter table scoring_rules enable row level security;
create policy "public read" on scoring_rules for select using (true);
-- Writable by an authenticated admin (Phase 4 settings UI) as well as the
-- service-role pipeline.
create policy "admin write" on scoring_rules for all to authenticated using (true) with check (true);
