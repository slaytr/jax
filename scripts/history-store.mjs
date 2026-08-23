/**
 * Sharded on-disk history: one file per UTC day, grouped into per-month
 * folders — data/history/YYYY-MM/DD.json.
 *
 * An hourly cron makes a single ever-growing history.json impractical: every
 * run would rewrite the group's entire tracking history just to append one
 * snapshot. Sharding by day means a run only ever touches (and the workflow
 * only ever commits) the one file that changed.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { HISTORY_VERSION } from './snapshots.mjs';

/** How far back to look for a comparison point when a day's file is empty. */
const MAX_LOOKBACK_DAYS = 7;

export const dayKeyOf = (epochSeconds) => new Date(epochSeconds * 1000).toISOString().slice(0, 10);

export function pathForDay(dataDir, dayKey) {
  const [year, month, day] = dayKey.split('-');
  return join(dataDir, 'history', `${year}-${month}`, `${day}.json`);
}

const priorDayKey = (dayKey) => {
  const date = new Date(`${dayKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
};

async function readDayFile(dataDir, dayKey) {
  try {
    return JSON.parse(await readFile(pathForDay(dataDir, dayKey), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error(`Could not read history file for ${dayKey}: ${error.message}`);
  }
}

async function writeDayFile(dataDir, dayKey, snapshots) {
  const path = pathForDay(dataDir, dayKey);
  await mkdir(dirname(path), { recursive: true });
  const file = { version: HISTORY_VERSION, day: dayKey, snapshots };
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
}

/**
 * The last recorded snapshot before `dayKey` starts, so a redundancy check can
 * see across a day boundary rather than always writing the first reading of a
 * new day. Gives up after a week — a gap that long has nothing meaningful to
 * compare against anyway.
 */
async function lastSnapshotBefore(dataDir, dayKey) {
  let cursor = dayKey;
  for (let i = 0; i < MAX_LOOKBACK_DAYS; i += 1) {
    cursor = priorDayKey(cursor);
    const file = await readDayFile(dataDir, cursor);
    if (file?.snapshots?.length) return file.snapshots[file.snapshots.length - 1];
  }
  return null;
}

/**
 * Appends one snapshot to its day's file, creating the file and month folder
 * as needed. Skips the write entirely when `isRedundant(snapshot, previous)`
 * says nothing changed, so an idle hour costs neither a file write nor (per
 * the workflow's git-diff check) a commit.
 */
export async function appendDailySnapshot(dataDir, snapshot, isRedundant) {
  const dayKey = dayKeyOf(snapshot.t);
  const todayFile = await readDayFile(dataDir, dayKey);
  const todaySnapshots = todayFile?.snapshots ?? [];

  const previous =
    todaySnapshots.length > 0 ? todaySnapshots[todaySnapshots.length - 1] : await lastSnapshotBefore(dataDir, dayKey);

  if (isRedundant(snapshot, previous)) return { appended: false, dayKey, count: todaySnapshots.length };

  const snapshots = [...todaySnapshots, snapshot];
  await writeDayFile(dataDir, dayKey, snapshots);
  return { appended: true, dayKey, count: snapshots.length };
}
