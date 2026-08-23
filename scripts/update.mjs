#!/usr/bin/env node
/**
 * Entry point for the scheduled hiscore update.
 *
 * Reads data/players.json, pulls each account from the RS3 feed, then rewrites
 * data/latest.json and appends a snapshot to today's file under data/history/.
 * Run by GitHub Actions on a cron; safe to run locally too.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchAllPlayers } from './hiscores.mjs';
import { fetchGroupRank } from './group-rank.mjs';
import { fetchAllQuestPoints } from './quests.mjs';
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

function validateRoster(roster) {
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

/**
 * The group leaderboard is scraped rather than served as an API, so a failure is
 * expected occasionally. Keep the last good standing instead of dropping it.
 */
async function resolveGroupRank(group, previous) {
  const result = await fetchGroupRank(group.hiscoresUrl, group.name);

  if (result.ok) {
    const { ok, ...rank } = result;
    console.log(`  ok    group rank      #${rank.rank} of ${rank.totalGroups} competitive groups`);
    return { ...rank, stale: false, error: null, checkedAt: new Date().toISOString() };
  }

  console.log(`  FAIL  group rank      ${result.error}`);
  return previous ? { ...previous, stale: true, error: result.error } : null;
}

async function main() {
  const roster = validateRoster(await readJson(ROSTER_PATH, null));
  const now = new Date();
  const epochSeconds = Math.floor(now.getTime() / 1000);

  console.log(`Fetching ${roster.players.length} accounts for group "${roster.group?.name ?? 'unnamed'}"…`);

  const results = await fetchAllPlayers(roster.players, (result) => {
    console.log(
      result.ok
        ? `  ok    ${result.name.padEnd(16)} total ${result.skills[0].level} / ${result.skills[0].xp.toLocaleString('en-GB')} xp`
        : `  FAIL  ${result.name.padEnd(16)} ${result.error}`,
    );
  });

  const succeeded = results.filter((result) => result.ok);
  if (succeeded.length === 0) {
    throw new Error('Every player fetch failed — refusing to overwrite existing data.');
  }

  const previousLatest = await readJson(LATEST_PATH, null);

  const group = roster.group ?? { name: 'Group', tagline: '' };
  const groupRank = await resolveGroupRank(group, previousLatest?.groupRank ?? null);

  const quests = await fetchAllQuestPoints(roster.players, (player, result) => {
    console.log(
      result.ok
        ? `  ok    ${player.name.padEnd(16)} ${result.questPoints} quest points (${result.questsComplete} quests)`
        : `  FAIL  ${player.name.padEnd(16)} quests: ${result.error}`,
    );
  });

  const snapshot = toSnapshot(results, epochSeconds, groupRank, quests);
  const { appended, dayKey, count } = await appendDailySnapshot(DATA_DIR, snapshot, isRedundant);
  const players = mergePlayers(roster.players, results, previousLatest?.players ?? [], quests);

  const latest = {
    version: HISTORY_VERSION,
    fetchedAt: now.toISOString(),
    trackingSince: previousLatest?.trackingSince ?? now.toISOString(),
    group,
    groupRank,
    players,
  };

  await writeJson(LATEST_PATH, latest);

  const failed = results.length - succeeded.length;
  const historyNote = appended
    ? `appended to history/${dayKey}.json (${count} today)`
    : `no change — skipped history/${dayKey}.json`;
  console.log(`\nWrote latest.json (${succeeded.length} ok, ${failed} carried forward); ${historyNote}.`);
}

main().catch((error) => {
  console.error(`\nUpdate failed: ${error.message}`);
  process.exitCode = 1;
});
