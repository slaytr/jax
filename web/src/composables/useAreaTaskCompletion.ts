import { reactive } from 'vue';

/**
 * A viewer's own manual "I've done this" marks for Area Tasks — TEMP
 * localStorage-only, same shape as useGoalGraphNotes.ts/
 * useGoalGraphPositions.ts, keyed per player since a group ironman's
 * teammates each have their own diary progress. There's no real completion
 * data behind this (see TasksTab.vue's own doc comment — the hiscores API
 * has no notion of individual Area Tasks completion), so this is a plain
 * self-reported checklist, not a synced fact about the account.
 *
 * Keyed by task slug (area-tasks.js's own, unique across every region —
 * verified when that data was built) rather than the region/tier it lives
 * under, so a task's own identity doesn't change if it ever moves tier.
 */
const key = (slug: string) => `jax:area-tasks-completed:${slug}`;

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

export function useAreaTaskCompletion(playerSlug: string) {
  const completed = reactive(readCompleted(playerSlug));

  function toggle(taskSlug: string) {
    if (completed.has(taskSlug)) completed.delete(taskSlug);
    else completed.add(taskSlug);
    writeCompleted(playerSlug, completed);
  }

  function isCompleted(taskSlug: string) {
    return completed.has(taskSlug);
  }

  return { completed, toggle, isCompleted };
}
