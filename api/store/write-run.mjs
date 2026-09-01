/**
 * The DB sink for one update cycle — the counterpart to scripts/update.mjs's
 * own file-sink main() (writeJson + appendDailySnapshot). One transaction:
 * roster sync, the latest.json-shaped state, and (if it isn't redundant —
 * see isRedundant in scripts/snapshots.mjs) a new history snapshot either
 * all land together or none do.
 */

import { withTransaction } from '../db.mjs';
import { upsertRoster, upsertLatest, upsertPlayerState, insertSnapshotEntry } from './upserts.mjs';

/**
 * @param roster data/players.json's shape — synced into `players`/`groups`
 *   on every run so a roster edit takes effect the next cycle without a
 *   separate deploy step.
 * @param latest runUpdate()'s own `latest` result — written into
 *   `group_state`/`player_state`/`player_quest_status`.
 * @param snapshot runUpdate()'s own `snapshot` result, or null to skip the
 *   history insert entirely (the caller already ran isRedundant() against
 *   readMostRecentSnapshot() and found nothing worth recording).
 */
export async function writeRun({ roster, latest, snapshot }) {
  await withTransaction(async (client) => {
    await upsertRoster(client, roster);
    await upsertLatest(client, latest);
    if (snapshot) await insertSnapshotEntry(client, snapshot);
  });
}

/**
 * The single-player counterpart — updates exactly one player's state
 * (never the roster or group_state, and never another player's row), plus
 * an optional new snapshot containing only that player. Used by
 * POST /api/players/:slug/refresh, where touching the other four players'
 * data would be a lie: nothing was actually fetched for them this cycle.
 */
export async function writePlayerRun({ fetchedAt, player, snapshotEntry }) {
  await withTransaction(async (client) => {
    await upsertPlayerState(client, fetchedAt, player);
    if (snapshotEntry) await insertSnapshotEntry(client, snapshotEntry);
  });
}
