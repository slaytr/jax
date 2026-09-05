import { reactive } from 'vue';

import { moveInOrder } from '@/lib/goalOrder';

/**
 * A viewer's own manual reordering of the Goals tab's list view
 * (GoalsList.vue) — TEMP localStorage-only, same reasoning as
 * useGoals.ts's own goals themselves (no server-backed ordering to sync
 * yet, and every visitor can already edit everyone's goals in this
 * pre-auth build, so there's nothing extra to gate here either).
 *
 * Two independent orders, both keyed the same way GoalsList.vue's own
 * v-for :key already identifies each row — nothing new needs inventing
 * just to reorder:
 *  - `sections`: which named quest group, or the trailing ungrouped
 *    "Skills" bucket, shows first — keyed by section title (goals.ts's own
 *    ' ' sentinel for the ungrouped one).
 *  - `items`: which individual goal shows first *within* one section's own
 *    list — keyed by goal id. Meaningful only where a section actually has
 *    more than one item (in practice just the ungrouped bucket, since
 *    every other section's own itemsFor is just the one quest), but
 *    harmless to carry for every section alike.
 */
const key = (slug: string) => `jax:goal-order:${slug}`;

interface StoredOrder {
  sections: string[];
  items: string[];
}

function readOrder(slug: string): StoredOrder {
  try {
    const raw = localStorage.getItem(key(slug));
    const parsed = raw ? JSON.parse(raw) : null;
    return {
      sections: Array.isArray(parsed?.sections) ? parsed.sections : [],
      items: Array.isArray(parsed?.items) ? parsed.items : [],
    };
  } catch {
    return { sections: [], items: [] };
  }
}

function writeOrder(slug: string, order: StoredOrder) {
  try {
    localStorage.setItem(key(slug), JSON.stringify(order));
  } catch {
    // Storage blocked or full — the reorder still applies for the rest of this visit.
  }
}

export function useGoalOrder(slug: string) {
  const order = reactive(readOrder(slug));

  /** @param currentKeys every section's own key, in the order they're
   * currently rendered in (already past both the active/completed split
   * and any earlier custom order) — see moveInOrder's own doc comment on
   * why the *effective*, on-screen order is what a drag has to start from. */
  function moveSection(currentKeys: string[], draggedKey: string, targetKey: string | null) {
    order.sections = moveInOrder(currentKeys, draggedKey, targetKey);
    writeOrder(slug, order);
  }

  /** @param currentIds every item's own goal id, in that one section's own
   * current on-screen order — see moveSection's own doc comment. */
  function moveItem(currentIds: string[], draggedId: string, targetId: string | null) {
    order.items = moveInOrder(currentIds, draggedId, targetId);
    writeOrder(slug, order);
  }

  return { order, moveSection, moveItem };
}
