/**
 * Loads the group's current state and recent history from the API.
 *
 * Postgres is canonical now (see the Postgres migration plan) — this used
 * to fetch data/latest.json plus up to 33 daily data/history/YYYY-MM/DD.json
 * shards directly as static files (committed by a GitHub Actions job,
 * since the RS3 hiscore feed sends no CORS headers and a browser can't
 * call it directly). The site and the API now share an origin, so this is
 * just two ordinary same-origin fetches through api-client.js.
 */

import { apiGet } from './api-client.js';
import { colourForPlayer } from './config.js';

/** The longest Gains window is a rolling month; a couple of days' margin
 * keeps that baseline lookup covered even right at the edge. The server
 * (api/routes/read.mjs) also never looks back further than the group's own
 * trackingSince, so this is a ceiling, not a promise every request scans
 * that far. */
const HISTORY_WINDOW_DAYS = 33;

function validateLatest(latest) {
  if (!latest || typeof latest !== 'object') throw new Error('/api/latest returned no data.');
  if (!Array.isArray(latest.players)) throw new Error('/api/latest has no players array.');
  if (latest.players.length === 0) throw new Error('/api/latest contains no players.');
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
  const [latest, history] = await Promise.all([
    apiGet('/latest').then(validateLatest),
    apiGet(`/history?days=${HISTORY_WINDOW_DAYS}`),
  ]);

  return {
    fetchedAt: latest.fetchedAt,
    trackingSince: latest.trackingSince ?? null,
    group: latest.group ?? { name: 'Group', tagline: '' },
    groupRank: latest.groupRank ?? null,
    players: decorate(latest.players),
    snapshots: history.snapshots,
  };
}
