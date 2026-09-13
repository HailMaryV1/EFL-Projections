-- Real pivot 2026-09-13: fantasy.efl.com's own json/fantasy/live_scores/{round}.json
-- (confirmed live, fully public, no auth) gives a genuine per-player, per-MATCH
-- breakdown for every real player who played - not just ones with a scoring
-- event - including real minutesPlayed and real penaltySaves, neither of
-- which any previously-used source provided. See docs/data-and-weights.md's
-- updated "Real pivot" section for the full reasoning.
alter table player_stats add column minutes_played integer;
alter table player_stats add column penalty_saves integer;
