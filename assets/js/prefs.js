/**
 * Persisted UI state — which player is highlighted in Account Standings and
 * the Gains grid, whether each section is showing its grid or line-chart
 * view, and which Day/Week/Month window Gains' grid and line views were each
 * last showing (tracked separately per view — see app.js's
 * gainsGridPeriod/gainsLinePeriod), plus (Vue app only) whether a player's
 * Goals tab was last showing its list or graph view (goalsView — see
 * GoalsList.vue) and whether the Quests tab's second column was last showing
 * its dependency map or quick guide (questGraphView — see
 * QuestDependencyGraph.vue). Everything else (sort order, the invert toggle)
 * resets on reload; these are the ones worth a reader not having to redo.
 *
 * localStorage only: per-browser, never sent anywhere. Reads/writes are
 * best-effort — private browsing or a full/blocked store should never break
 * the page, just silently not remember.
 */

const KEY = 'jax:prefs';

export function loadPrefs() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function savePrefs(prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Storage blocked or full — nothing to do, the page still works.
  }
}
