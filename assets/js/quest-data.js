/**
 * Loads quest-data/quests.json — the RS3 quest list captured by
 * quest-data/fetch-quests.mjs (see that folder's README). Fetched lazily by
 * whoever needs it (the Quests tab, stats.js) rather than on every stats
 * page load: it's ~340KB and most visits never open that tab.
 */

const QUESTS_URL = new URL('../../quest-data/quests.json', import.meta.url);

let cached = null;

export async function loadQuests() {
  if (cached) return cached;

  let response;
  try {
    response = await fetch(QUESTS_URL, { cache: 'no-cache' });
  } catch (cause) {
    throw new Error(`Could not reach ${QUESTS_URL.pathname} (${cause.message}).`);
  }
  if (!response.ok) throw new Error(`${QUESTS_URL.pathname} responded ${response.status}.`);

  const data = await response.json();
  if (!Array.isArray(data?.quests)) throw new Error(`${QUESTS_URL.pathname} has no quests array.`);

  cached = data.quests;
  return cached;
}
