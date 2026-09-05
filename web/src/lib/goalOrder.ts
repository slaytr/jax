/**
 * The reordering primitives behind the Goals tab's list view drag-and-drop
 * (GoalsList.vue, useGoalOrder.ts) — kept separate from goals.ts's own
 * ordering (active-before-completed, most-recent-first) since a viewer's
 * manual order is a layer *on top* of that, not a replacement for it: both
 * section order and within-section item order still respect the
 * active/completed split, a viewer only ever reorders within one side of
 * it.
 */

/** Sorts `items` by their position in `order` — anything `order` doesn't
 * name (a goal created since the viewer last reordered, say) keeps its own
 * original relative position, sorting after everything `order` does know
 * about. A stable sort (guaranteed since ES2019), so two items neither one
 * names never swap relative to each other just from calling this. */
export function applyCustomOrder<T>(items: T[], order: string[], idOf: (item: T) => string): T[] {
  const indexOf = new Map(order.map((id, i) => [id, i]));
  const rank = (item: T) => indexOf.get(idOf(item)) ?? Infinity;
  return [...items].sort((a, b) => rank(a) - rank(b));
}

/** The new full order after dragging `draggedId` to sit just before
 * `targetId` — or to the very end, when `targetId` is null (dropped past
 * the last row). `currentIds` is the *effective*, already-on-screen order
 * (apply applyCustomOrder first, not some raw unordered fetch), so a drag
 * always starts from what the viewer actually sees, including whatever
 * they'd already reordered earlier.
 *
 * Returns every id `currentIds` names, not a sparse patch — persisting the
 * *result* wholesale as the new stored order means the next render's own
 * applyCustomOrder has nothing left unordered to fall back on for any of
 * them, however many drags this is the first one for. */
export function moveInOrder(currentIds: string[], draggedId: string, targetId: string | null): string[] {
  const withoutDragged = currentIds.filter((id) => id !== draggedId);
  const targetIndex = targetId === null ? -1 : withoutDragged.indexOf(targetId);
  if (targetIndex === -1) return [...withoutDragged, draggedId];
  return [...withoutDragged.slice(0, targetIndex), draggedId, ...withoutDragged.slice(targetIndex)];
}
