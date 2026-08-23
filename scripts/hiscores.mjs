/**
 * RuneScape 3 hiscore feed client.
 *
 * Jagex serves the hiscore feed WITHOUT any Access-Control-Allow-Origin header,
 * so a browser on github.io can never call it directly. Every request in this
 * project therefore happens server-side, inside the GitHub Actions runner.
 */

const HISCORE_TABLES = Object.freeze({
  main: 'https://secure.runescape.com/m=hiscore/index_lite.json',
  ironman: 'https://secure.runescape.com/m=hiscore_ironman/index_lite.json',
  hardcore: 'https://secure.runescape.com/m=hiscore_hardcore_ironman/index_lite.json',
});

const REQUEST_TIMEOUT_MS = 20000;
const RETRY_DELAYS_MS = Object.freeze([1000, 3000, 7000]);

/** Number of skills the RS3 feed returns (Overall + 29 skills, incl. Necromancy). */
export const SKILL_COUNT = 30;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function tableUrl(table, playerName) {
  const base = HISCORE_TABLES[table];
  if (!base) {
    throw new Error(`Unknown hiscore table "${table}". Expected one of: ${Object.keys(HISCORE_TABLES).join(', ')}`);
  }
  return `${base}?player=${encodeURIComponent(playerName)}`;
}

/**
 * The feed answers 404 for "this account is not ranked on this table" and serves
 * an HTML error page rather than JSON, so a bare response.json() is not safe.
 */
async function requestOnce(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'jax-hiscores (github.com/slaytr/jax)' },
    });

    if (response.status === 404) {
      return { ok: false, retryable: false, error: 'not ranked on this hiscore table (404)' };
    }
    if (!response.ok) {
      return { ok: false, retryable: response.status >= 500 || response.status === 429, error: `HTTP ${response.status}` };
    }

    const body = await response.text();
    if (!body.trimStart().startsWith('{')) {
      return { ok: false, retryable: true, error: 'feed returned a non-JSON body (rate limited or error page)' };
    }

    try {
      return { ok: true, data: JSON.parse(body) };
    } catch {
      return { ok: false, retryable: true, error: 'feed returned malformed JSON' };
    }
  } catch (cause) {
    const reason = cause?.name === 'AbortError' ? `timed out after ${REQUEST_TIMEOUT_MS}ms` : String(cause?.message ?? cause);
    return { ok: false, retryable: true, error: reason };
  } finally {
    clearTimeout(timer);
  }
}

async function requestWithRetry(url) {
  let last = await requestOnce(url);

  for (const delay of RETRY_DELAYS_MS) {
    if (last.ok || !last.retryable) return last;
    await sleep(delay);
    last = await requestOnce(url);
  }
  return last;
}

/**
 * Validates the shape of a feed payload. Never trust the upstream response:
 * a truncated or reshaped payload must fail loudly, not silently write zeroes.
 */
function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') return 'payload is not an object';
  if (!Array.isArray(payload.skills)) return 'payload.skills is not an array';
  if (payload.skills.length < SKILL_COUNT) {
    return `expected at least ${SKILL_COUNT} skills, got ${payload.skills.length}`;
  }

  const malformed = payload.skills.find(
    (skill) => !Number.isInteger(skill?.id) || !Number.isFinite(skill?.level) || !Number.isFinite(skill?.xp),
  );
  return malformed ? `skill entry ${JSON.stringify(malformed)} is malformed` : null;
}

/** The feed reports "unranked" as -1; surface that as null rather than a fake rank. */
const normaliseRank = (rank) => (Number.isFinite(rank) && rank > 0 ? rank : null);

function normalisePayload(payload) {
  const skills = payload.skills
    .slice(0, SKILL_COUNT)
    .map((skill) => ({
      id: skill.id,
      level: Math.max(0, Math.trunc(skill.level)),
      xp: Math.max(0, Math.trunc(skill.xp)),
      rank: normaliseRank(skill.rank),
    }))
    .sort((a, b) => a.id - b.id);

  const activities = (Array.isArray(payload.activities) ? payload.activities : [])
    .filter((activity) => Number.isFinite(activity?.score) && activity.score > 0)
    .map((activity) => ({ name: String(activity.name), score: Math.trunc(activity.score), rank: normaliseRank(activity.rank) }));

  return { skills, activities };
}

/**
 * Fetches one player. Resolves to a discriminated result rather than throwing,
 * so that one dead account can never abort the whole group's update.
 */
export async function fetchPlayer(player) {
  const result = await requestWithRetry(tableUrl(player.table ?? 'main', player.name));
  if (!result.ok) {
    return { ok: false, slug: player.slug, name: player.name, error: result.error };
  }

  const invalid = validatePayload(result.data);
  if (invalid) {
    return { ok: false, slug: player.slug, name: player.name, error: invalid };
  }

  return {
    ok: true,
    slug: player.slug,
    name: player.name,
    table: player.table ?? 'main',
    ...normalisePayload(result.data),
  };
}

/** Fetched sequentially and deliberately: the feed rate-limits parallel bursts. */
export async function fetchAllPlayers(players, log = () => {}) {
  const results = [];
  for (const player of players) {
    const result = await fetchPlayer(player);
    log(result);
    results.push(result);
    await sleep(400);
  }
  return results;
}
