import { computed, ref, watch } from 'vue';

import type { GainsPeriod, GainsView } from '@/lib/gains';
import { usePrefs } from '@/composables/usePrefs';

const isPeriod = (value: unknown): value is GainsPeriod => value === 'day' || value === 'week' || value === 'month';
const isGainsView = (value: unknown): value is GainsView => value === 'grid' || value === 'line' || value === 'split';

/**
 * Persisted view/period state for the Gains section and Account Standings —
 * ported from the old app.js's own gainsView/gainsGridPeriod/gainsLinePeriod/
 * standingsView + currentGainsPeriod()/setGainsPeriod(). Gains' grid, line,
 * and split views each remember their own last-used Day/Week/Month window
 * (so switching views doesn't move the others' date range); `gainsPeriod`
 * reads and writes whichever is active, and Standings' "today" gain chip
 * reads that same computed so it always mirrors what Gains is showing.
 * Standings itself never reaches 'split' (its own ViewToggle doesn't offer
 * it — see ViewToggle.vue's `showSplit`), but shares the same GainsView type.
 */
export function useGainsViewState() {
  const { prefs, savePref } = usePrefs();

  const gainsView = ref<GainsView>(isGainsView(prefs.gainsView) ? prefs.gainsView : 'split');
  const gainsGridPeriod = ref<GainsPeriod>(isPeriod(prefs.gainsGridPeriod) ? prefs.gainsGridPeriod : 'day');
  const gainsLinePeriod = ref<GainsPeriod>(isPeriod(prefs.gainsLinePeriod) ? prefs.gainsLinePeriod : 'week');
  const gainsSplitPeriod = ref<GainsPeriod>(isPeriod(prefs.gainsSplitPeriod) ? prefs.gainsSplitPeriod : 'week');
  const standingsView = ref<GainsView>(prefs.standingsView === 'line' ? 'line' : 'grid');

  watch(gainsView, (value) => savePref({ gainsView: value }));
  watch(gainsGridPeriod, (value) => savePref({ gainsGridPeriod: value }));
  watch(gainsLinePeriod, (value) => savePref({ gainsLinePeriod: value }));
  watch(gainsSplitPeriod, (value) => savePref({ gainsSplitPeriod: value }));
  watch(standingsView, (value) => savePref({ standingsView: value }));

  const gainsPeriod = computed<GainsPeriod>({
    get: () => {
      if (gainsView.value === 'line') return gainsLinePeriod.value;
      if (gainsView.value === 'split') return gainsSplitPeriod.value;
      return gainsGridPeriod.value;
    },
    set: (period) => {
      if (gainsView.value === 'line') gainsLinePeriod.value = period;
      else if (gainsView.value === 'split') gainsSplitPeriod.value = period;
      else gainsGridPeriod.value = period;
    },
  });

  return { gainsView, gainsPeriod, standingsView };
}
