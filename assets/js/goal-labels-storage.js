/**
 * The per-player registry of goal labels — `{ name, colour }` pairs a
 * viewer has created from the "new goal" dialog's label picker
 * (player-goals.js). Separate from the goals themselves (goals-storage.js):
 * a label's colour is a property of the *label*, not of any one goal that
 * happens to carry it, so it has to survive independently of whichever
 * goals currently reference its name — including a goal being deleted, or
 * never having been created at all (a label can exist in the registry with
 * zero goals using it yet).
 *
 * Backed by the API now (see the plan) — the label list itself comes back
 * from goals-storage.js's loadGoalsAndLabels (one GET serves both), so this
 * module only has the two writes. `name` is URL-encoded going into the path
 * since a label name can contain spaces or other characters a raw path
 * segment can't.
 */

import { apiPut, apiDelete } from './api-client.js';

export async function putGoalLabel(slug, name, colour) {
  return apiPut(`/players/${slug}/goal-labels/${encodeURIComponent(name)}`, { colour });
}

export async function deleteGoalLabel(slug, name) {
  await apiDelete(`/players/${slug}/goal-labels/${encodeURIComponent(name)}`);
}
