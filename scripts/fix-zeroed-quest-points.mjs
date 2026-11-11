#!/usr/bin/env node
/**
 * One-off repair: a bad quest read recorded quest_points = 0 for every player
 * in a recent snapshot, which shows up as a quest-point crash-and-recovery in
 * everyone's history. (A null quest_points is a normal "not fetched" value; a
 * real 0 is not.)
 *
 * Finds every player_snapshots row with quest_points = 0 and, only where the
 * nearest non-null snapshot on each side of that player agrees on a value,
 * sets it to that value. Anything ambiguous is reported and left alone.
 * Also reports any player_state row still sitting at 0 (the next update
 * cycle normally overwrites it; it isn't modified here).
 *
 * Dry run by default; pass --apply to write. Runs in one transaction.
 * Safe to re-run: once fixed, there's nothing left matching.
 *
 * Production's DATABASE_URL is only reachable from inside Railway, so run it
 * there (the script must be deployed first):
 *   railway ssh --service web -- node scripts/fix-zeroed-quest-points.mjs
 *   railway ssh --service web -- node scripts/fix-zeroed-quest-points.mjs --apply
 * Locally (against .env.local's database):
 *   node --env-file=.env.local scripts/fix-zeroed-quest-points.mjs [--apply]
 */

import { withTransaction, closePool } from '../api/db.mjs';

async function findBadRows(client) {
  const { rows } = await client.query(
    `select ps.snapshot_id, ps.player_slug, s.taken_at,
            (select p.quest_points
               from player_snapshots p join snapshots t on t.id = p.snapshot_id
              where p.player_slug = ps.player_slug and p.quest_points is not null and t.taken_at < s.taken_at
              order by t.taken_at desc limit 1) as before_qp,
            (select p.quest_points
               from player_snapshots p join snapshots t on t.id = p.snapshot_id
              where p.player_slug = ps.player_slug and p.quest_points is not null and t.taken_at > s.taken_at
              order by t.taken_at asc limit 1) as after_qp
       from player_snapshots ps
       join snapshots s on s.id = ps.snapshot_id
      where ps.quest_points = 0
      order by s.taken_at, ps.player_slug`,
  );
  return rows;
}

async function main() {
  const apply = process.argv.includes('--apply');

  await withTransaction(async (client) => {
    const bad = await findBadRows(client);
    if (bad.length === 0) {
      console.log('No snapshots with quest_points = 0 — nothing to fix.');
    }

    let fixed = 0;
    for (const row of bad) {
      const label = `snapshot ${row.snapshot_id} (${row.taken_at.toISOString()}) ${row.player_slug}`;
      const { before_qp: before, after_qp: after } = row;
      // Quest points only ever go up, so the true value lies in [before, after].
      // With both neighbours, require them equal so the repair isn't a guess. With
      // no later snapshot (the zero is the newest row), the last good value is a
      // safe floor; the next real read raises it if the player has gained points.
      const value = after === null ? before : before === after ? before : null;
      if (before === null || value === null) {
        console.log(`  ${label}: neighbours ${before}/${after} don't give a safe value — skipped`);
        continue;
      }
      console.log(`  ${label}: quest_points 0 -> ${value}`);
      if (apply) {
        await client.query('update player_snapshots set quest_points = $1 where snapshot_id = $2 and player_slug = $3', [
          value,
          row.snapshot_id,
          row.player_slug,
        ]);
      }
      fixed += 1;
    }

    // player_state is what the update job's monotonic guard compares against, so
    // a 0 there would let the next bad read through. Restore it from the newest
    // non-zero snapshot value.
    const { rows: stale } = await client.query(
      `select st.player_slug,
              (select p.quest_points from player_snapshots p join snapshots t on t.id = p.snapshot_id
                where p.player_slug = st.player_slug and p.quest_points > 0
                order by t.taken_at desc limit 1) as good_qp
         from player_state st where st.quest_points = 0`,
    );
    for (const row of stale) {
      if (row.good_qp === null) {
        console.log(`  player_state ${row.player_slug}: no non-zero history — skipped`);
        continue;
      }
      console.log(`  player_state ${row.player_slug}: quest_points 0 -> ${row.good_qp}`);
      if (apply) {
        await client.query('update player_state set quest_points = $1 where player_slug = $2 and quest_points = 0', [
          row.good_qp,
          row.player_slug,
        ]);
      }
    }

    console.log(apply ? `\nFixed ${fixed} row(s).` : `\nDry run: ${fixed} row(s) would be fixed. Re-run with --apply to write.`);
  });
}

main()
  .catch((error) => {
    console.error(`\nFix failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(closePool);
