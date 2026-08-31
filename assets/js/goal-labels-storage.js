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
 * Keyed per player slug (jax:goal-labels:<slug>), same reasoning as
 * goals-storage.js: a label a viewer made while looking at one player's
 * page has no business appearing on another player's.
 */

const keyFor = (slug) => `jax:goal-labels:${slug}`;

export function loadGoalLabels(slug) {
  try {
    const raw = localStorage.getItem(keyFor(slug));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveGoalLabels(slug, labels) {
  try {
    localStorage.setItem(keyFor(slug), JSON.stringify(labels));
  } catch {
    // Storage blocked or full — nothing to do, the page still works.
  }
}
