/**
 * Raw quick-guide scrape for a subset of RS3 quests (quest-guides.json) —
 * one object per quest, keyed by its exact `name` string quest-data.js's
 * own /api/quests rows use (cross-checked against a live fetch: all 175
 * keys matched a real quest name exactly, key === its own `name` field
 * too). Only 175 of ~380 quests have an entry; a missing quest just has no
 * quick guide — see useQuestGuides.ts/questGuide.ts for how that (and the
 * data's own shape — nested steps, an `items_required: ["None"]` sentinel,
 * etc.) gets turned into something a component actually renders. This
 * module itself does no shaping at all, just the load+cache.
 *
 * Loaded through a dynamic import (not a top-level one) so Vite code-splits
 * it into its own chunk, fetched only once a viewer actually opens the
 * quick-guide view — same "most visits never need this" reasoning as
 * quest-data.js's own loadQuests, just one step further: even a visit that
 * opens the Quests tab doesn't necessarily switch off the dependency map.
 */
let cached = null;

export async function loadQuestGuides() {
  if (cached) return cached;

  const module = await import('./quest-guides.json');
  cached = module.default;
  return cached;
}
