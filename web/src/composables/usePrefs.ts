import { loadPrefs, savePrefs } from '@shared/prefs.js';

/**
 * Thin reactive wrapper around the shared prefs.js localStorage module.
 * Reads the full stored object but writes only a merge patch — a component
 * managing one pref key must not clobber another's.
 */
export function usePrefs() {
  const prefs = loadPrefs();

  const savePref = (patch: Record<string, unknown>) => {
    savePrefs({ ...loadPrefs(), ...patch });
  };

  return { prefs, savePref };
}
