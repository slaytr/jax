import { ref } from 'vue';

import type { AREA_TASK_REGIONS as AreaTaskRegions } from '@shared/area-tasks.js';

type AreaTaskRegion = (typeof AreaTaskRegions)[number];

let cached: AreaTaskRegion[] | null = null;

/**
 * The Tasks tab's own area-tasks.js load — a separate ~500KB data module
 * (619 tasks across every region) most visits never need, dynamically
 * imported on first switch to that tab rather than bundled into the main
 * PlayerView chunk every visitor downloads. Same "requested lazily, cached
 * module-wide" shape as useQuests.ts, just a code-split static import
 * instead of an API fetch — this data isn't per-player or backed by a
 * database table the way quests are, so there's nothing to fetch from.
 */
export function useAreaTasks() {
  const regions = ref<AreaTaskRegion[] | null>(cached);
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>(cached ? 'ready' : 'idle');
  const error = ref<string | null>(null);
  let requested = Boolean(cached);

  function ensureLoaded() {
    if (requested) return;
    requested = true;
    status.value = 'loading';
    import('@shared/area-tasks.js')
      .then((module) => {
        cached = module.AREA_TASK_REGIONS as AreaTaskRegion[];
        regions.value = cached;
        status.value = 'ready';
      })
      .catch((err: unknown) => {
        console.error(err);
        error.value = 'Could not load Area Tasks data.';
        status.value = 'error';
      });
  }

  return { regions, status, error, ensureLoaded };
}
