/**
 * Persisted UI state for a player's stats page — which tab, the Quests
 * tab's search/sort/filter selections, which questlines are expanded, the
 * Goals tab's label filter, which goal groups are collapsed, and which
 * goal is focused. Deliberately a separate key from prefs.js's `jax:prefs`
 * (that one's a full-blob overwrite per save; this one has its own,
 * larger shape and its own page).
 *
 * localStorage only: per-browser, never sent anywhere. Reads/writes are
 * best-effort — private browsing or a full/blocked store should never
 * break the page, just silently not remember.
 */

const KEY = 'jax:stats-state';

export function loadStatsState() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveStatsState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage blocked or full — nothing to do, the page still works.
  }
}
