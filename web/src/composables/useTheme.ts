import { onMounted, ref, type Ref } from 'vue';

/**
 * Direct port of the old theme.js — same 'jax:theme' key, same 'dark' |
 * 'light' values, same default-is-dark behaviour (the "forge ledger" dark
 * theme is the product's own identity, not a fallback for a light one).
 */
const STORAGE_KEY = 'jax:theme';
const THEMES = ['dark', 'light'] as const;
export type Theme = (typeof THEMES)[number];

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return (THEMES as readonly string[]).includes(stored ?? '') ? (stored as Theme) : 'dark';
  } catch {
    return 'dark';
  }
}

function applyThemeAttribute(next: Theme) {
  if (next === 'dark') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = next;
}

function persistTheme(next: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Storage blocked or full — the attribute's already set for this load;
    // just won't be remembered next visit.
  }
}

// A module singleton so every mounted consumer shares one value — read
// lazily, on first use, rather than at module-eval time: matches the old
// theme.js's getTheme() being a plain function re-checked on demand, not
// state cached from whenever the module happened to first load.
let theme: Ref<Theme> | null = null;

function sharedTheme() {
  if (!theme) theme = ref(readStoredTheme());
  return theme;
}

function setTheme(next: Theme) {
  sharedTheme().value = next;
  applyThemeAttribute(next);
  persistTheme(next);
}

export function useTheme() {
  const themeRef = sharedTheme();
  // The inline <script> in index.html already applied a stored 'light'
  // choice before first paint; this just re-syncs the attribute on normal
  // module load, same as the old applyStoredTheme() — a harmless no-op
  // confirming the same state for anyone who reaches this without that
  // inline snippet having run (a saved-for-offline copy of the page, say).
  onMounted(() => applyThemeAttribute(themeRef.value));

  const toggle = () => setTheme(themeRef.value === 'dark' ? 'light' : 'dark');

  return { theme: themeRef, toggle };
}
