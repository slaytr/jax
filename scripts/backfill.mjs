#!/usr/bin/env node
/**
 * One-time (but idempotent — safe to re-run) load of everything committed
 * as JSON into Postgres: data/players.json, data/latest.json,
 * data/history/**, quest-data/quests.json.
 *
 * Every write is an upsert, so re-running after more cron commits have
 * landed on main (see the plan's Branching section) just fills in whatever
 * is new — nothing needs to be truncated first.
 *
 * Kept around after the cutover that deletes data/latest.json,
 * data/history/**, and quest-data/quests.json from the working tree — it's
 * only useful again against a checkout of a commit that still has them
 * (rebuilding a database from scratch off pre-cutover history, say), so
 * running it post-cutover on a normal checkout just logs "skipped" for
 * everything past the roster.
 *
 * Usage: node scripts/backfill.mjs
 */

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withTransaction, closePool } from '../api/db.mjs';
import { upsertRoster, upsertLatest, insertSnapshotEntry, upsertQuests } from '../api/store/upserts.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'data');

async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw new Error(`Could not read ${path}: ${error.message}`);
  }
}

/** Every `*.json` file under `data/history/`, in no particular order — the
 * insert below is keyed on `taken_at` so ordering doesn't matter. */
async function historyFiles() {
  const historyDir = join(DATA_DIR, 'history');
  const monthDirs = await readdir(historyDir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const monthDir of monthDirs) {
    if (!monthDir.isDirectory()) continue;
    const dayFiles = await readdir(join(historyDir, monthDir.name));
    for (const dayFile of dayFiles) {
      if (dayFile.endsWith('.json')) files.push(join(historyDir, monthDir.name, dayFile));
    }
  }
  return files;
}

async function backfillHistory(client) {
  const files = await historyFiles();
  let snapshotCount = 0;
  let playerSnapshotCount = 0;

  for (const file of files) {
    const shard = await readJson(file);
    if (!Array.isArray(shard?.snapshots)) continue;

    for (const snapshot of shard.snapshots) {
      const { playerCount } = await insertSnapshotEntry(client, snapshot);
      snapshotCount += 1;
      playerSnapshotCount += playerCount;
    }
  }

  return { files: files.length, snapshots: snapshotCount, playerSnapshots: playerSnapshotCount };
}

async function main() {
  const roster = await readJson(join(DATA_DIR, 'players.json'));
  if (!roster) throw new Error('data/players.json not found — nothing to backfill from.');

  const latest = await readJson(join(DATA_DIR, 'latest.json'));
  const questData = await readJson(join(ROOT, 'quest-data', 'quests.json'));

  await withTransaction(async (client) => {
    await upsertRoster(client, roster);
    console.log(`Roster: ${roster.players.length} players.`);

    await upsertLatest(client, latest);
    console.log(latest ? `Latest: ${latest.players?.length ?? 0} player states.` : 'Latest: no data/latest.json, skipped.');

    const historyResult = await backfillHistory(client);
    console.log(
      `History: ${historyResult.files} shard file(s), ${historyResult.snapshots} snapshot(s), ${historyResult.playerSnapshots} player-snapshot(s).`,
    );

    const questResult = await upsertQuests(client, questData);
    console.log(questData ? `Quests: ${questResult.quests} quests.` : 'Quests: no quest-data/quests.json, skipped.');
  });

  console.log('\nBackfill complete.');
}

main()
  .catch((error) => {
    console.error(`\nBackfill failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(closePool);
