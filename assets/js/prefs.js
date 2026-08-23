/**
 * Persisted UI state — which player is highlighted in Account Standings and
 * the Gains grid, and whether Gains is showing the grid or the bar charts.
 * Everything else (sort order, the invert toggle, the selected period) resets
 * on reload; these three are the ones worth a reader not having to redo.
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
