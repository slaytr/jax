/**
 * Loads the committed snapshot files.
 *
 * The RS3 hiscore feed sends no CORS headers, so the browser cannot call Jagex
 * directly. These files are produced server-side by scripts/update.mjs running in
 * GitHub Actions, and are plain static assets from the page's own origin.
 */

import { colourForIndex } from './config.js';

const LATEST_URL = new URL('../../data/latest.json', import.meta.url);
const HISTORY_URL = new URL('../../data/history.json', import.meta.url);

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
 * Colour is assigned by total-level position — the leader takes the first hue,
 * and so on left-to-right down the standings. Note the consequence: because the
 * assignment follows rank rather than identity, two players swapping places
 * swaps their colours. That is the requested behaviour; if colours should
 * instead be pinned per account, key this off `slug` order rather than level.
 */
function decorate(players) {
  const byLevel = [...players]
    .sort((a, b) => (b.total?.level ?? 0) - (a.total?.level ?? 0) || (b.total?.xp ?? 0) - (a.total?.xp ?? 0))
    .map((player) => player.slug);

  return players.map((player) => ({
    ...player,
    colour: colourForIndex(byLevel.indexOf(player.slug)),
    skillById: Object.fromEntries((player.skills ?? []).map((skill) => [skill.id, skill])),
  }));
}

export async function loadGroupData() {
  const [latest, history] = await Promise.all([
    loadJson(LATEST_URL, { required: true }),
    loadJson(HISTORY_URL, { required: false }),
  ]);

  validateLatest(latest);

  return {
    fetchedAt: latest.fetchedAt,
    trackingSince: latest.trackingSince ?? null,
    group: latest.group ?? { name: 'Group', tagline: '' },
    groupRank: latest.groupRank ?? null,
    players: decorate(latest.players),
    snapshots: Array.isArray(history?.snapshots) ? history.snapshots : [],
  };
}
