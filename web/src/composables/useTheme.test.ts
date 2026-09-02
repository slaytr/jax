import { createApp } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Runs a composable inside a real mounted component so its onMounted hook
 * actually fires — calling a composable bare (outside setup()) leaves
 * lifecycle hooks as silent no-ops. */
function withSetup<T>(composable: () => T): T {
  let result!: T;
  const app = createApp({
    setup() {
      result = composable();
      return () => null;
    },
  });
  app.mount(document.createElement('div'));
  return result;
}

// useTheme's shared ref is a module singleton (every consumer reads the
// same value) initialized lazily on first use, so each test needs its own
// fresh module instance to avoid leaking state into the next test.
async function freshUseTheme() {
  vi.resetModules();
  return (await import('./useTheme')).useTheme;
}

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it('defaults to dark (no data-theme attribute) when nothing is stored', async () => {
    const useTheme = await freshUseTheme();
    const { theme } = withSetup(useTheme);
    expect(theme.value).toBe('dark');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('applies a stored light choice by setting data-theme', async () => {
    localStorage.setItem('jax:theme', 'light');
    const useTheme = await freshUseTheme();
    const { theme } = withSetup(useTheme);
    expect(theme.value).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('an unrecognised stored value falls back to dark', async () => {
    localStorage.setItem('jax:theme', 'sepia');
    const useTheme = await freshUseTheme();
    const { theme } = withSetup(useTheme);
    expect(theme.value).toBe('dark');
  });

  it('toggle() flips the theme, applies/removes the attribute, and persists it', async () => {
    const useTheme = await freshUseTheme();
    const { theme, toggle } = withSetup(useTheme);

    toggle();
    expect(theme.value).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('jax:theme')).toBe('light');

    toggle();
    expect(theme.value).toBe('dark');
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem('jax:theme')).toBe('dark');
  });
});
