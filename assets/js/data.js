/**
 * Loads the committed snapshot files.
 *
 * The RS3 hiscore feed sends no CORS headers, so the browser cannot call Jagex
 * directly. These files are produced server-side by scripts/update.mjs running in
 * GitHub Actions, and are plain static assets from the page's own origin.
 */

import { colourForPlayer } from './config.js';

const LATEST_URL = new URL('../../data/latest.json', import.meta.url);

/**
 * History is sharded one file per UTC day (data/history/YYYY-MM/DD.json —
 * see scripts/history-store.mjs), so a run only ever has to write the one
 * file that changed instead of rewriting the group's entire tracking history.
 *
 * The page never needs more than a month of it: the longest Gains period is
 * "month", a rolling 30-day window (see compute.js) — a couple of days'
 * margin keep that baseline lookup covered even right at the edge.
 */
const HISTORY_WINDOW_DAYS = 33;

const utcDayKey = (date) => date.toISOString().slice(0, 10);

function historyFileUrl(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return new URL(`../../data/history/${year}-${month}/${day}.json`, import.meta.url);
}

/**
 * Fetches the last `days` daily shards — but never further back than
 * `trackingSince`, so a group in its first weeks doesn't spend a fetch (and a
 * console 404) on days that provably can't exist yet. Flattens the result
 * into one ascending-by-time snapshot array — the same shape `compute.js`
 * expected from the old single history.json.
 */
async function loadRecentHistory(days, trackingSince) {
  const today = new Date();
  const earliestKey = trackingSince ? utcDayKey(new Date(trackingSince)) : null;

  const urls = [];
  for (let offset = 0; offset < days; offset += 1) {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() - offset);
    if (earliestKey && utcDayKey(date) < earliestKey) break;
    urls.push(historyFileUrl(date));
  }

  const files = await Promise.all(urls.map((url) => loadJson(url, { required: false })));

  return files
    .flatMap((file) => (Array.isArray(file?.snapshots) ? file.snapshots : []))
    .sort((a, b) => a.t - b.t);
}

async function loadJson(url, { required }) {
  let response;
  try {
    response = await fetch(url, { cache: 'no-cache' });
  } catch (cause) {
    throw new Error(`Could not reach ${url.pathname} (${cause.message}).`);
  }

  if (!response.ok) {
    if (!required && response.status === 404) return null;
    throw new Error(`${url.pathname} responded ${response.status}.`);
  }

  try {
    return await response.json();
  } catch {
    throw new Error(`${url.pathname} is not valid JSON.`);
  }
}

function validateLatest(latest) {
  if (!latest || typeof latest !== 'object') throw new Error('latest.json is not an object.');
  if (!Array.isArray(latest.players)) throw new Error('latest.json has no players array.');
  if (latest.players.length === 0) throw new Error('latest.json contains no players.');
  return latest;
}

/**
 * Attaches presentation-only fields the views need, without mutating the source.
 *
 * Colour is pinned per account (see PLAYER_COLOURS in config.js) rather than
 * derived from live standings, so a player keeps their colour as ranks shift
 * — two players crossing in the standings no longer swaps their colours.
 */
function decorate(players) {
  return players.map((player, index) => ({
    ...player,
    colour: colourForPlayer(player.slug, index),
    skillById: Object.fromEntries((player.skills ?? []).map((skill) => [skill.id, skill])),
  }));
}

export async function loadGroupData() {
  const latest = validateLatest(await loadJson(LATEST_URL, { required: true }));
  const snapshots = await loadRecentHistory(HISTORY_WINDOW_DAYS, latest.trackingSince);

  return {
    fetchedAt: latest.fetchedAt,
    trackingSince: latest.trackingSince ?? null,
    group: latest.group ?? { name: 'Group', tagline: '' },
    groupRank: latest.groupRank ?? null,
    players: decorate(latest.players),
    snapshots,
  };
}
