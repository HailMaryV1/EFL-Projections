-- Real gap found while designing the projection engine (Phase 3): the
-- official Fixture Difficulty Rating (fdrHome/fdrAway, 1-5, higher =
-- harder to face) is already in fefl/squads' real response - seed_teams.py
-- just wasn't storing it. This is the one real free signal Fixture
-- Quality can use in place of live market odds (Premium-gated - see
-- docs/data-and-weights.md), so it needs a home.
--
-- Semantics (same convention already used for dreamteam-scraper's own
-- team_season_strength.home_strength/away_strength, see memory): a club's
-- own fdr_home/fdr_away rates HOW HARD THAT CLUB IS TO FACE depending on
-- which venue THEY occupy. To price a fixture for team T against opponent
-- O: if O is playing at home, use O.fdr_home; if O is away, use
-- O.fdr_away.
alter table teams add column fdr_home numeric;
alter table teams add column fdr_away numeric;
