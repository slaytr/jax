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

/** Byte-for-byte comparison — every field this API returns is plain
 * JSON (no functions/dates/cycles) with a stable key order from one call
 * to the next, so stringifying is a cheap, correct stand-in for a real
 * deep-equal here. */
function sameContent(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Reuses `previous`'s own element for anything in `next` whose content
 * didn't change, keyed by `keyOf` (a player's slug, a snapshot's epoch
 * second) — a reload without this would swap in a brand new object for
 * every player/snapshot, and since those flow straight into components as
 * `:player="player"` props, every one of those subtrees (skill grid, quest
 * list, goals, …) would re-render on every refresh even when that specific
 * player's numbers didn't move. Keeping the reference stable for anything
 * unchanged means Vue's own prop-diffing skips that subtree entirely — a
 * refresh only re-renders whichever few players/points actually changed. */
function reconcile<T>(previous: T[], next: T[], keyOf: (item: T) => string): T[] {
  const previousByKey = new Map(previous.map((item) => [keyOf(item), item]));
  return next.map((item) => {
    const before = previousByKey.get(keyOf(item));
    return before && sameContent(before, item) ? before : item;
  });
}

async function reload() {
  // Only the very first load has nothing on screen yet to justify App.vue's
  // full-page "Reading the ledger…" gate — a refresh (cron, the button, or
  // someone else's, all via SSE) already has good data showing, and
  // flipping this back on would unmount/remount the whole routed page
  // (App.vue's `v-if="loading"`) just to swap in numbers the reconcile
  // below, plus OdometerValue, already update in place without it.
  const isInitialLoad = data.value === null;
  if (isInitialLoad) loading.value = true;
  try {
    const next = await loadGroupData();
    const previous = data.value;
    data.value = previous
      ? {
          ...next,
          players: reconcile(previous.players, next.players, (player: { slug: string }) => player.slug),
          snapshots: reconcile(previous.snapshots, next.snapshots, (snapshot: { t: number }) => String(snapshot.t)),
        }
      : next;
    error.value = null;
  } catch (cause) {
    // A background refresh failing shouldn't take an already-loaded page
    // down with it — only surface the full error state when there's
    // nothing on screen already (App.vue checks `error && !data`).
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    if (isInitialLoad) loading.value = false;
  }
}

export function useGroupData() {
  if (!started) {
    started = true;
    reload();
  }
  return { data, error, loading, reload };
}
