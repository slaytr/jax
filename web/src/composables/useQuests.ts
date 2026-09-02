import { ref } from 'vue';

import { loadQuests } from '@shared/quest-data.js';

/**
 * The Quests tab's own quest-data load — a separate ~340KB fetch most
 * visits never need, requested lazily on first switch to that tab rather
 * than alongside the rest of the player page. Ported from stats.js's own
 * questsState/questsRequested/ensureQuestsLoaded slice; loadQuests
 * (quest-data.js) already caches the result module-wide, so a second
 * ensureLoaded call from another mount (switching tabs away and back) is
 * cheap either way.
 */
export function useQuests() {
  const quests = ref<any[] | null>(null);
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const error = ref<string | null>(null);
  let requested = false;

  function ensureLoaded() {
    if (requested) return;
    requested = true;
    status.value = 'loading';
    loadQuests()
      .then((data: any[]) => {
        quests.value = data;
        status.value = 'ready';
      })
      .catch((err: unknown) => {
        console.error(err);
        error.value = 'Could not load quest data.';
        status.value = 'error';
      });
  }

  return { quests, status, error, ensureLoaded };
}
