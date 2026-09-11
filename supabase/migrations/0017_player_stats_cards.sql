-- Real pivot found while building the projection engine (Phase 3):
-- DreamTeamTonic's free fefl/overall-stats-by-gw endpoint returns a
-- genuine ZERO for goals/assists/tackles/etc across all 3570 real
-- players (confirmed live, not a scraper bug) - the official
-- fantasy.efl.com site's OWN json/fantasy/players.json and
-- json/fantasy/rounds.json (real match events: Goal/YellowCard/RedCard/
-- OwnGoal/Penalty, with playerId/minute/assistPlayerId) have the genuine
-- per-stat data instead, and are equally free/no-login. Ingestion is
-- being rebuilt around this real source - see CLAUDE.md Status and
-- docs/data-and-weights.md for the full story.
--
-- Real match events (rounds.json) let us price 4 stats that had no real
-- source at all before: yellow cards, red cards, own goals, and missed
-- penalties (a "Penalty" event with no same-minute "Goal" for the same
-- player - confirmed live: 0 of 35 real "Penalty" events this season so
-- far have a matching same-minute Goal, supporting this as "missed",
-- not "scored"). No real "penalty save" attribution exists in this feed
-- (the event only carries the taker's playerId, not a saving
-- goalkeeper's) - that one stat stays genuinely unpriced.
alter table player_stats add column yellow_cards integer;
alter table player_stats add column red_cards integer;
alter table player_stats add column own_goals integer;
alter table player_stats add column missed_penalties integer;
