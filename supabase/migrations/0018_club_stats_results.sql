-- Real club_scoring_rules needs win/draw/away-win counts directly (not
-- back-derived from league_points, which conflates wins and draws into
-- one number) - now buildable for real from fantasy.efl.com's own
-- rounds.json match results (home/away score per real game), the same
-- pivot as migration 0017.
alter table club_stats add column wins integer;
alter table club_stats add column draws integer;
alter table club_stats add column losses integer;
alter table club_stats add column away_wins integer;
