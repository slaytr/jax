/**
 * Loads the RS3 quest list from GET /api/quests — backed by Postgres now
 * (see quest-data/README.md and the Postgres migration plan), not the old
 * committed quest-data/quests.json. Fetched lazily by whoever needs it (the
 * Quests tab, stats.js) rather than on every stats page load: it's a large
 * payload and most visits never open that tab.
 */

import { apiGet } from './api-client.js';

let cached = null;

export async function loadQuests() {
  if (cached) return cached;

  const data = await apiGet('/quests');
  if (!Array.isArray(data?.quests)) throw new Error('/api/quests returned no quests array.');

  cached = data.quests;
  return cached;
}
