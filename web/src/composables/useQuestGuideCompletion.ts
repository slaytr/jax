import { reactive } from 'vue';

/**
 * A viewer's own manual step-by-step progress through a quick guide
 * (QuestGuideStepList.vue's own checkbox in place of each step's bullet) —
 * TEMP localStorage-only, same shape/reasoning as
 * useAreaTaskCompletion.ts's own manual "I've done this" marks: there's no
 * real "which quick-guide step have you done" data to sync, this is a
 * plain self-reported checklist, kept per player since a group ironman's
 * teammates each work through a guide at their own pace.
 *
 * Keyed by `${questName}::${path}` — quest-guides.json's steps have no id
 * of their own, so `path` is a step's own position in its quest's step
 * tree (section index, then one more index per nesting level down to that
 * step, dot-joined — e.g. `"1.0.2"` is section 1's first step's third
 * substep). Stable as long as this bundled dataset itself doesn't change
 * shape; a future re-scrape that reorders a quest's own steps would shift
 * existing marks along with it, same trade-off useAreaTaskCompletion.ts
 * already accepts for a slug that moves tier.
 */
const key = (slug: string) => `jax:quest-guide-steps-completed:${slug}`;

function readCompleted(slug: string): Set<string> {
  try {
    const raw = localStorage.getItem(key(slug));
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function writeCompleted(slug: string, completed: Set<string>) {
  try {
    localStorage.setItem(key(slug), JSON.stringify([...completed]));
  } catch {
    // Storage blocked or full — marks still work for the rest of this visit.
  }
}

export function useQuestGuideCompletion(playerSlug: string) {
  const completed = reactive(readCompleted(playerSlug));

  function toggle(id: string) {
    if (completed.has(id)) completed.delete(id);
    else completed.add(id);
    writeCompleted(playerSlug, completed);
  }

  function isCompleted(id: string) {
    return completed.has(id);
  }

  return { completed, toggle, isCompleted };
}
