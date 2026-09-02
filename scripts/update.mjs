#!/usr/bin/env node
/**
 * Entry point for the scheduled hiscore update.
 *
 * Reads data/players.json, pulls each account from the RS3 feed, then rewrites
 * data/latest.json and appends a snapshot to today's file under data/history/.
 * Run by GitHub Actions on a cron; safe to run locally too.
 *
 * The actual fetch-and-merge work lives in runUpdate() below, which takes a
 * roster and the previous latest.json in memory and returns the same shapes
 * without writing anywhere — main() here is just the file-sink wrapper
 * around it. api/jobs/update-job.mjs is the other caller, writing the same
 * result into Postgres instead; see the plan for why this split exists.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { fetchAllPlayers } from './hiscores.mjs';
import { fetchGroupRank } from './group-rank.mjs';
import { fetchAllQuestPoints } from './quests.mjs';
import { fetchAllLatestActivity } from './activity.mjs';
import { isRedundant, mergePlayers, toSnapshot, HISTORY_VERSION } from './snapshots.mjs';
import { appendDailySnapshot } from './history-store.mjs';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const ROSTER_PATH = join(DATA_DIR, 'players.json');
const LATEST_PATH = join(DATA_DIR, 'latest.json');

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw new Error(`Could not read ${path}: ${error.message}`);
  }
}

const writeJson = (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');

export function validateRoster(roster) {
  if (!roster || typeof roster !== 'object') throw new Error('players.json is not an object');
  if (!Array.isArray(roster.players) || roster.players.length === 0) {
    throw new Error('players.json must contain a non-empty "players" array');
  }

  const slugs = new Set();
  for (const player of roster.players) {
    if (!player?.slug || !player?.name) {
      throw new Error(`Every player needs a "slug" and a "name": ${JSON.stringify(player)}`);
    }
    if (slugs.has(player.slug)) throw new Error(`Duplicate player slug "${player.slug}"`);
    slugs.add(player.slug);
  }
  return roster;
}

/** Console-formatted progress, matching what this script has always
 * printed. A caller (api/jobs/update-job.mjs) that wants different
 * formatting — or none — passes its own `log` instead. */
const defaultLog = {
  player: (result) =>
    console.log(
      result.ok
        ? `  ok    ${result.name.padEnd(16)} total ${result.skills[0].level} / ${result.skills[0].xp.toLocaleString('en-GB')} xp`
        : `  FAIL  ${result.name.padEnd(16)} ${result.error}`,
    ),
  groupRank: (result) =>
    console.log(
      result.ok
        ? `  ok    group rank      #${result.rank} of ${result.totalGroups} competitive groups`
        : `  FAIL  group rank      ${result.error}`,
    ),
  quest: (player, result) =>
    console.log(
      result.ok
        ? `  ok    ${player.name.padEnd(16)} ${result.questPoints} quest points (${result.questsComplete} quests)`
        : `  FAIL  ${player.name.padEnd(16)} quests: ${result.error}`,
    ),
  activity: (player, result) =>
    console.log(
      result.ok
        ? `  ok    ${player.name.padEnd(16)} ${result.text ?? '(no activity yet)'}`
        : `  FAIL  ${player.name.padEnd(16)} activity: ${result.error}`,
    ),
};

/**
 * The group leaderboard is scraped rather than served as an API, so a failure is
 * expected occasionally. Keep the last good standing instead of dropping it.
 */
async function resolveGroupRank(group, previous, log) {
  const result = await fetchGroupRank(group.hiscoresUrl, group.name);
  log.groupRank(result);

  if (result.ok) {
    const { ok, ...rank } = result;
    return { ...rank, stale: false, error: null, checkedAt: new Date().toISOString() };
  }

  return previous ? { ...previous, stale: true, error: result.error } : null;
}

/**
 * Fetches everything one update cycle needs and returns it — no file IO, no
 * console output beyond the optional `log` callbacks, no process exit.
 * `roster` is data/players.json's shape; `previousLatest` is the last
 * latest.json this ran with (or null on a first run — every "carry the
 * previous value forward" fallback below degrades gracefully from that).
 *
 * Returns `{results, groupRank, quests, activity, snapshot, latest}`:
 * - `results`/`quests`/`activity` are the raw per-player fetch outcomes,
 *   useful to a caller that wants to know exactly what succeeded/failed this cycle
 *   (api/store/write-run.mjs uses `results` to decide what to write).
 * - `snapshot`/`latest` are the same shapes toSnapshot()/mergePlayers()
 *   have always produced — a history shard entry and a full latest.json.
 *
 * Throws if every player fetch failed, same "refuse to overwrite existing
 * data with nothing" guard main() has always had.
 */
export async function runUpdate({ roster, previousLatest = null, log = defaultLog }) {
  const now = new Date();
  const epochSeconds = Math.floor(now.getTime() / 1000);

  const results = await fetchAllPlayers(roster.players, log.player);
  const succeeded = results.filter((result) => result.ok);
  if (succeeded.length === 0) {
    throw new Error('Every player fetch failed — refusing to overwrite existing data.');
  }

  const group = roster.group ?? { name: 'Group', tagline: '' };
  const groupRank = await resolveGroupRank(group, previousLatest?.groupRank ?? null, log);
  const quests = await fetchAllQuestPoints(roster.players, log.quest);
  const activity = await fetchAllLatestActivity(roster.players, log.activity);

  const snapshot = toSnapshot(results, epochSeconds, groupRank, quests);
  const players = mergePlayers(roster.players, results, previousLatest?.players ?? [], quests, activity);

  const latest = {
    version: HISTORY_VERSION,
    fetchedAt: now.toISOString(),
    // On a brand-new group's first-ever run, this has to equal the
    // snapshot's own `taken_at` (derived from the whole-second
    // `epochSeconds`, not `now` directly) rather than the full-millisecond
    // `now.toISOString()` — GET /api/history bounds its query to
    // `taken_at >= trackingSince`, and a few hundred milliseconds of
    // truncation drift there would silently exclude that very first
    // snapshot from history forever.
    trackingSince: previousLatest?.trackingSince ?? new Date(epochSeconds * 1000).toISOString(),
    group,
    groupRank,
    players,
  };

  return { results, groupRank, quests, activity, snapshot, latest };
}

/** Fetches just one player — the ad-hoc single-player refresh endpoint's
 * entry point (POST /api/players/:slug/refresh). Doesn't touch group rank
 * or the other four players' quest points, so it's the ~1s "just me" path
 * the plan's Refresh decision calls for, not a full runUpdate(). */
export async function runPlayerUpdate({ player, previousPlayer = null, log = defaultLog }) {
  const epochSeconds = Math.floor(Date.now() / 1000);

  const [result] = await fetchAllPlayers([player], log.player);
  // fetchAllQuestPoints/fetchAllLatestActivity, unlike fetchAllPlayers,
  // return an object keyed by slug rather than an array — see their own
  // return shapes in quests.mjs/activity.mjs.
  const questsBySlug = await fetchAllQuestPoints([player], log.quest);
  const quest = questsBySlug[player.slug];
  const activityBySlug = await fetchAllLatestActivity([player], log.activity);
  const activity = activityBySlug[player.slug];

  // toSnapshot()/mergePlayers() both take a full-group results array, but
  // work just as well handed an array of one — the "only successful
  // fetches make it in" filtering they already do is exactly what a single
  // player's carried-forward-on-failure fallback needs too.
  const snapshotEntry = result.ok ? toSnapshot([result], epochSeconds, null, questsBySlug) : null;
  const [merged] = mergePlayers([player], [result], previousPlayer ? [previousPlayer] : [], questsBySlug, activityBySlug);

  return { result, quest, activity, player: merged, snapshotEntry };
}

async function main() {
  const roster = validateRoster(await readJson(ROSTER_PATH, null));
  console.log(`Fetching ${roster.players.length} accounts for group "${roster.group?.name ?? 'unnamed'}"…`);

  const previousLatest = await readJson(LATEST_PATH, null);
  const { results, snapshot, latest } = await runUpdate({ roster, previousLatest });

  const { appended, dayKey, count } = await appendDailySnapshot(DATA_DIR, snapshot, isRedundant);
  await writeJson(LATEST_PATH, latest);

  const succeeded = results.filter((result) => result.ok).length;
  const failed = results.length - succeeded;
  const historyNote = appended
    ? `appended to history/${dayKey}.json (${count} today)`
    : `no change — skipped history/${dayKey}.json`;
  console.log(`\nWrote latest.json (${succeeded} ok, ${failed} carried forward); ${historyNote}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`\nUpdate failed: ${error.message}`);
    process.exitCode = 1;
  });
}
