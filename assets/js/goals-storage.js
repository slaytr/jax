/**
 * Per-player skill/quest goals — shared across every viewer of a player's
 * page now, backed by the API rather than localStorage (see the plan: goals
 * used to exist only in the browser that created them). The client still
 * builds a goal's full content itself (buildQuestGoalDrafts in
 * quest-goal.js, the skill dialog in player-goals.js) and posts it
 * ready-made, id included — createGoals/updateGoal/deleteGoal are thin
 * wrappers over api-client.js, not a new persistence model.
 *
 * Every write here will reject with a 401/403 for a signed-out viewer or
 * one who doesn't own `slug` — callers only invoke these from behind the
 * ownership gate stats.js/player-goals.js already have to check anyway to
 * decide whether to show the create/delete UI at all.
 */

import { apiGet, apiPost, apiPatch, apiDelete } from './api-client.js';

/** One fetch serves both goals and their label registry — the API returns
 * them together (they're read in the same GET), so there's no separate
 * loadGoalLabels the way there was a separate localStorage key for each. */
export function loadGoalsAndLabels(slug) {
  return apiGet(`/players/${slug}/goals`);
}

/** `drafts` is always an array — one element for a plain skill goal, or a
 * quest goal plus one skill goal per unmet requirement
 * (buildQuestGoalDrafts) inserted together in one transaction. Returns the
 * created goals in the same order-independent shape the server persisted. */
export async function createGoals(slug, drafts) {
  const { goals } = await apiPost(`/players/${slug}/goals`, { goals: drafts });
  return goals;
}

export async function updateGoal(slug, id, patch) {
  const { goal } = await apiPatch(`/players/${slug}/goals/${id}`, patch);
  return goal;
}

export async function deleteGoal(slug, id) {
  await apiDelete(`/players/${slug}/goals/${id}`);
}
