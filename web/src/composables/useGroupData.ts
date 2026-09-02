import { ref } from 'vue';

import { loadGroupData } from '@shared/data.js';

/** Wraps data.js's loadGroupData() (GET /api/latest + /api/history) in
 * reactive refs — the same shape app.js's own `state` used to seed itself
 * from, minus the UI-only fields each component now owns itself.
 *
 * Module-singleton (same pattern as useRefreshEvents.ts's shared
 * EventSource): App.vue's persistent masthead and whichever route is
 * mounted below it (HomeView, PlayerView, …) all call this and all get the
 * same refs back. The data is fetched once, not once per view, so
 * switching between players is instant — no request has to round-trip
 * before the new content can render — and a refresh (cron or the refresh
 * button, via SSE) updates every view sharing it at once. */
const data = ref<Awaited<ReturnType<typeof loadGroupData>> | null>(null);
const error = ref<string | null>(null);
const loading = ref(true);
let started = false;

async function reload() {
  loading.value = true;
  try {
    data.value = await loadGroupData();
    error.value = null;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    loading.value = false;
  }
}

export function useGroupData() {
  if (!started) {
    started = true;
    reload();
  }
  return { data, error, loading, reload };
}
