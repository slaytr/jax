/**
 * Each player's single most recent RuneMetrics activity (a level-up, a
 * quest completion, a quest-points milestone) — the same profile endpoint
 * RuneMetrics itself uses, asked for just the latest entry.
 *
 * Distinct from `player.activities` (scripts/hiscores.mjs), which is the
 * *hiscore feed's* activity leaderboard (RuneScore rank, clue scroll
 * counts) — an unrelated, differently-shaped thing that happens to share
 * the word "activity". This module's result lands on `player.latestActivity`
 * instead, singular, to keep the two apart.
 *
 * Same privacy caveat as quests.mjs: a player who has hidden their profile
 * gets {"error":"PROFILE_PRIVATE"} back. Normal outcome, not a bug.
 */

const ENDPOINT = 'https://apps.runescape.com/runemetrics/profile/profile';
const REQUEST_TIMEOUT_MS = 20000;
const USER_AGENT = 'jax-hiscores (github.com/slaytr/jax)';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

/**
 * RuneMetrics reports a plain "02-Sep-2026 10:36" with no timezone —
 * treated as UTC, the same assumption the rest of this app makes for
 * every other timestamp it handles. Returns null (rather than throwing)
 * for anything that doesn't match, so one unexpected format degrades to
 * "no date" instead of taking the whole fetch down. Exported for testing.
 */
export function parseActivityDate(raw) {
  const match = /^(\d{2})-([A-Za-z]{3})-(\d{4}) (\d{2}):(\d{2})$/.exec(raw ?? '');
  if (!match) return null;
  const [, day, monthName, year, hour, minute] = match;
  const month = MONTHS[monthName];
  if (month === undefined) return null;

  const date = new Date(Date.UTC(Number(year), month, Number(day), Number(hour), Number(minute)));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Picks the first (most recent) entry out of a profile payload's
 * `activities` list. Exported for testing. */
export function latestActivityFrom(payload) {
  if (payload?.error) return { ok: false, error: `RuneMetrics: ${payload.error}` };
  if (!Array.isArray(payload?.activities)) return { ok: false, error: 'RuneMetrics returned no activity list' };
  if (payload.activities.length === 0) return { ok: true, text: null, details: null, date: null };

  const [latest] = payload.activities;
  return {
    ok: true,
    text: latest?.text ?? null,
    details: latest?.details ?? null,
    date: parseActivityDate(latest?.date),
  };
}

async function fetchOne(name) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    // activities=1 — this only ever reads the single latest entry, so
    // there's no reason to ask RuneMetrics for more.
    const url = `${ENDPOINT}?user=${encodeURIComponent(name)}&activities=1`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    });
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };

    const body = await response.text();
    try {
      return latestActivityFrom(JSON.parse(body));
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

/** Sequential, like the hiscore and quest fetches — this API rate-limits
 * bursts too. */
export async function fetchAllLatestActivity(players, log = () => {}) {
  const bySlug = {};

  for (const player of players) {
    const result = await fetchOne(player.name);
    bySlug[player.slug] = result;
    log(player, result);
    await sleep(300);
  }
  return bySlug;
}
