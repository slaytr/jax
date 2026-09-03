#!/usr/bin/env node
/**
 * The DB-backed counterpart to scripts/update.mjs's file-sink main() —
 * reads the roster off disk (data/players.json stays a hand-edited file
 * per the plan), fetches the same way runUpdate()/runPlayerUpdate() always
 * have, and writes into Postgres instead of data/*.json.
 *
 * Two entry points, both plain functions with no HTTP/lock/bookkeeping
 * knowledge — that belongs to whichever caller invokes them:
 * - runGroupUpdateCycle(): the Railway cron's own `node api/jobs/update-job.mjs`
 *   (main(), below) and POST /api/refresh (api/routes/refresh.mjs).
 * - runSinglePlayerUpdateCycle(slug): POST /api/players/:slug/refresh.
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { validateRoster, runUpdate, runPlayerUpdate } from '../../scripts/update.mjs';
import { isRedundant } from '../../scripts/snapshots.mjs';
import { readCurrentLatest, readMostRecentSnapshot } from '../store/current-state.mjs';
import { writeRun, writePlayerRun } from '../store/write-run.mjs';
import { closePool } from '../db.mjs';
import { runMigrations } from '../migrate.mjs';

const ROSTER_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'players.json');

async function readRoster() {
  return validateRoster(JSON.parse(await readFile(ROSTER_PATH, 'utf8')));
}

/**
 * The full group cycle: every roster player, the ladder, quest points —
 * same shape as an hourly cron tick, just triggerable on demand too. Skips
 * the snapshot insert when isRedundant() says nothing moved since the last
 * recorded snapshot, exactly like the file-based history shards always
 * have (no reason a Postgres row history should grow any faster).
 */
export async function runGroupUpdateCycle() {
  const roster = await readRoster();
  const [previousLatest, previousSnapshot] = await Promise.all([readCurrentLatest(), readMostRecentSnapshot()]);

  const { results, snapshot, latest } = await runUpdate({ roster, previousLatest });
  const snapshotIsNew = !isRedundant(snapshot, previousSnapshot);

  await writeRun({ roster, latest, snapshot: snapshotIsNew ? snapshot : null });

  const succeeded = results.filter((result) => result.ok).length;
  return { succeeded, failed: results.length - succeeded, snapshotInserted: snapshotIsNew };
}

/**
 * One player, fetched fresh — the ~1s path behind the per-player refresh
 * button. Always records a snapshot entry on success rather than running
 * it through isRedundant(): that check compares two snapshots' whole
 * player-slug sets, which would just never match a single-player entry
 * against the group's last (5-player) snapshot anyway — a real, deliberate
 * button press is worth a data point even if nothing moved.
 */
export async function runSinglePlayerUpdateCycle(slug) {
  const roster = await readRoster();
  const rosterPlayer = roster.players.find((candidate) => candidate.slug === slug);
  if (!rosterPlayer) throw new Error(`No roster player "${slug}".`);

  const previousLatest = await readCurrentLatest();
  const previousPlayer = previousLatest?.players.find((candidate) => candidate.slug === slug) ?? null;

  const { result, player, snapshotEntry } = await runPlayerUpdate({ player: rosterPlayer, previousPlayer });

  await writePlayerRun({ fetchedAt: new Date().toISOString(), player, snapshotEntry });

  return { ok: result.ok, error: result.error, player };
}

async function main() {
  // Same reasoning as server.mjs's own boot sequence: this writes through
  // api/store/upserts.mjs, which can reference a column a just-added
  // migration hasn't necessarily reached this service's own database
  // connection for yet — the cron service redeploys independently of the
  // web one, so it needs this same guarantee rather than assuming the web
  // service's own boot got there first.
  await runMigrations();

  console.log('Running group update cycle…');
  const summary = await runGroupUpdateCycle();
  console.log(
    `Done: ${summary.succeeded} ok, ${summary.failed} carried forward; snapshot ${summary.snapshotInserted ? 'recorded' : 'skipped — no change'}.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((error) => {
      console.error(`\nUpdate job failed: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(closePool);
}
