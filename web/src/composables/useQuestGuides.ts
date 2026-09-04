import { ref } from 'vue';

import { loadQuestGuides } from '@shared/quest-guides.js';
import { normalizeQuestGuide, type QuestGuide } from '@/lib/questGuide';

export type { QuestGuide, QuestGuideSection, QuestGuideStep } from '@/lib/questGuide';

/**
 * The Quests tab's quick-guide view (QuestDependencyGraph.vue) — a further
 * lazy load past useQuests.ts's own: requested only once a viewer actually
 * switches to that view, not just from opening the Quests tab. loadQuestGuides
 * (quest-guides.js) already caches the raw fetch module-wide, so a second
 * ensureLoaded call from another mount is cheap either way; normalizeQuestGuide
 * (questGuide.ts) re-runs on it here rather than being cached itself — cheap
 * enough over 175 quests that it's not worth a second cache layer.
 */
export function useQuestGuides() {
  const guides = ref<Record<string, QuestGuide> | null>(null);
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
  let requested = false;

  function ensureLoaded() {
    if (requested) return;
    requested = true;
    status.value = 'loading';
    loadQuestGuides()
      .then((data: Record<string, any>) => {
        const normalized: Record<string, QuestGuide> = {};
        for (const [name, entry] of Object.entries(data)) normalized[name] = normalizeQuestGuide(entry);
        guides.value = normalized;
        status.value = 'ready';
      })
      .catch((err: unknown) => {
        console.error(err);
        status.value = 'error';
      });
  }

  return { guides, status, ensureLoaded };
}
