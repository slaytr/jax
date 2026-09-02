/**
 * Light/dark theme — an explicit per-browser choice (localStorage), not
 * derived from prefers-color-scheme: the "forge ledger" dark theme is the
 * product's own default identity, not a fallback for a light one, so it
 * stays the default until a viewer picks otherwise. See styles.css's own
 * aesthetic note for what actually changes between the two.
 *
 * The initial apply happens twice, deliberately: a tiny inline, non-module
 * script in <head> (index.html / the stats template) sets the attribute
 * synchronously before first paint, so there's no flash of the wrong
 * theme. This module's own applyStoredTheme() re-does the same read on
 * normal module load — a harmless no-op confirming the same state, and the
 * only path that runs at all for anyone who somehow reaches this without
 * the inline snippet (a saved-for-offline copy of the page, say).
 */

const KEY = 'jax:theme';
const THEMES = ['dark', 'light'];

export function getTheme() {
  try {
    const stored = localStorage.getItem(KEY);
    return THEMES.includes(stored) ? stored : 'dark';
  } catch {
    return 'dark';
  }
}

export function setTheme(theme) {
  const next = THEMES.includes(theme) ? theme : 'dark';
  if (next === 'dark') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Storage blocked or full — the attribute's already set for this load;
    // just won't be remembered next visit.
  }
}

export function applyStoredTheme() {
  setTheme(getTheme());
}
