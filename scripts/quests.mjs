/**
 * Quest points, from the RuneMetrics API.
 *
 * The hiscore feed does not expose quest points at all — its activities list
 * carries RuneScore and clue counts, but nothing about quests. RuneMetrics does,
 * as a per-quest list, so the total is summed from completed entries.
 *
 * RuneMetrics honours the in-game privacy setting: a player who has hidden their
 * profile returns {"error":"PROFILE_PRIVATE"}. That is a normal outcome, not a
 * bug, and is reported as such.
 */

const ENDPOINT = 'https://apps.runescape.com/runemetrics/quests';
const REQUEST_TIMEOUT_MS = 20000;
const USER_AGENT = 'jax-hiscores (github.com/slaytr/jax)';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Sums questPoints across completed quests. Exported for testing. */
export function questPointsFrom(payload) {
  if (payload?.error) return { ok: false, error: `RuneMetrics: ${payload.error}` };
  if (!Array.isArray(payload?.quests)) return { ok: false, error: 'RuneMetrics returned no quest list' };

  const completed = payload.quests.filter((quest) => quest?.status === 'COMPLETED');
  const points = completed.reduce((sum, quest) => sum + (Number(quest.questPoints) || 0), 0);

  return { ok: true, questPoints: points, questsComplete: completed.length, questsTotal: payload.quests.length };
}

async function fetchOne(name) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${ENDPOINT}?user=${encodeURIComponent(name)}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    });
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };

    const body = await response.text();
    try {
      return questPointsFrom(JSON.parse(body));
    } catch {
      return { ok: false, error: 'RuneMetrics returned malformed JSON' };
    }
  } catch (cause) {
    const reason = cause?.name === 'AbortError' ? `timed out after ${REQUEST_TIMEOUT_MS}ms` : String(cause?.message ?? cause);
    return { ok: false, error: reason };
  } finally {
    clearTimeout(timer);
  }
}

/** Sequential, like the hiscore fetch — this API rate-limits bursts too. */
export async function fetchAllQuestPoints(players, log = () => {}) {
  const byslug = {};

  for (const player of players) {
    const result = await fetchOne(player.name);
    byslug[player.slug] = result;
    log(player, result);
    await sleep(300);
  }
  return byslug;
}
