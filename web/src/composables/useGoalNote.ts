import { ref, watch } from 'vue';

/**
 * A viewer's own free-text note on the Goals tab's list view — TEMP
 * localStorage-only, same reasoning as useGoalOrder.ts's own reordering
 * (no server-backed notes to sync yet). One note per player, keyed the same
 * `jax:` way every other per-player localStorage blob on this page already is.
 * The textarea's own drag-resized height is persisted the same way, so a
 * viewer who's stretched it out doesn't get the default 3-row box back on
 * every visit.
 */
const noteKey = (slug: string) => `jax:goal-note:${slug}`;
const heightKey = (slug: string) => `jax:goal-note-height:${slug}`;

function readValue(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function writeValue(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked or full — the value still exists for the rest of this
    // visit, it just won't survive a reload.
  }
}

export function useGoalNote(slug: string) {
  const text = ref(readValue(noteKey(slug)));
  watch(text, (value) => writeValue(noteKey(slug), value));

  const height = ref(readValue(heightKey(slug)));
  watch(height, (value) => writeValue(heightKey(slug), value));

  return { text, height };
}
