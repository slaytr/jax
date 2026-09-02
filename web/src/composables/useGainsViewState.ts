import { computed, ref, watch } from 'vue';

import type { GainsPeriod, GainsView } from '@/lib/gains';
import { usePrefs } from '@/composables/usePrefs';

const isPeriod = (value: unknown): value is GainsPeriod => value === 'day' || value === 'week' || value === 'month';

/**
 * Persisted view/period state for the Gains section and Account Standings —
 * ported from the old app.js's own gainsView/gainsGridPeriod/gainsLinePeriod/
 * standingsView + currentGainsPeriod()/setGainsPeriod(). Gains' grid and
 * line views each remember their own last-used Day/Week/Month window (so
 * switching views doesn't move the other's date range); `gainsPeriod` reads
 * and writes whichever of the two is active, and Standings' "today" gain
 * chip reads that same computed so it always mirrors what Gains is showing.
 */
export function useGainsViewState() {
  const { prefs, savePref } = usePrefs();

  const gainsView = ref<GainsView>(prefs.gainsView === 'line' ? 'line' : 'grid');
  const gainsGridPeriod = ref<GainsPeriod>(isPeriod(prefs.gainsGridPeriod) ? prefs.gainsGridPeriod : 'day');
  const gainsLinePeriod = ref<GainsPeriod>(isPeriod(prefs.gainsLinePeriod) ? prefs.gainsLinePeriod : 'week');
  const standingsView = ref<GainsView>(prefs.standingsView === 'line' ? 'line' : 'grid');

  watch(gainsView, (value) => savePref({ gainsView: value }));
  watch(gainsGridPeriod, (value) => savePref({ gainsGridPeriod: value }));
  watch(gainsLinePeriod, (value) => savePref({ gainsLinePeriod: value }));
  watch(standingsView, (value) => savePref({ standingsView: value }));

  const gainsPeriod = computed<GainsPeriod>({
    get: () => (gainsView.value === 'line' ? gainsLinePeriod.value : gainsGridPeriod.value),
    set: (period) => {
      if (gainsView.value === 'line') gainsLinePeriod.value = period;
      else gainsGridPeriod.value = period;
    },
  });

  return { gainsView, gainsPeriod, standingsView };
}
