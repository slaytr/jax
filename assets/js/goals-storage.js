/**
 * Per-player skill goals set from the Goals tab — entirely client-side:
 * there's no backend to write to, so a goal only exists in the browser that
 * created it, same as the Quests tab's search/filter state (stats.js's own
 * jax:stats-state). Keyed per player slug (jax:goals:<slug>) rather than one
 * shared key, since browsing to a different player's page must never show
 * another player's goals.
 */

const keyFor = (slug) => `jax:goals:${slug}`;

export function loadGoals(slug) {
  try {
    const raw = localStorage.getItem(keyFor(slug));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveGoals(slug, goals) {
  try {
    localStorage.setItem(keyFor(slug), JSON.stringify(goals));
  } catch {
    // Storage blocked or full — nothing to do, the page still works.
  }
}
