-- Each player's single most recent RuneMetrics activity (a level-up, a
-- quest completion, a quest-points milestone) — see scripts/activity.mjs.
-- JSONB rather than three scalar columns: {text, details, date}, the same
-- shape scripts/activity.mjs's latestActivityFrom() already produces, and
-- it's read/written as one unit everywhere, never queried by field.
alter table player_state add column latest_activity jsonb;
