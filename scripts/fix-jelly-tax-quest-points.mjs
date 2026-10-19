#!/usr/bin/env node
/**
 * One-off repair: Jelly Tax's 2026-10-18 00:05 UTC snapshot (id 1210) was
 * recorded with quest_points = 0 — a transient bad hiscores/quest read —
 * between neighbours reading 313 and 316, which shows up as a quest-point
 * crash-and-recovery in her history. (A null quest_points is a normal,
 * tolerated "not fetched" value for every player; a real 0 is not, and this
 * is the only one in the table.)
 *
 * Finds every jelly-tax player_snapshots row with quest_points = 0 and, only
 * where the nearest non-null snapshot on each side agrees on a value, sets
 * it to that value. Anything ambiguous is reported and left alone.
 *
 * Dry run by default; pass --apply to write. Runs in one transaction.
 * Safe to re-run: once fixed, there's nothing left matching.
 *
 * Production's DATABASE_URL is only reachable from inside Railway, so run it
 * there (the script must be deployed first):
 *   railway ssh --service web -- node scripts/fix-jelly-tax-quest-points.mjs
 *   railway ssh --service web -- node scripts/fix-jelly-tax-quest-points.mjs --apply
 * Locally (against .env.local's database):
 *   node --env-file=.env.local scripts/fix-jelly-tax-quest-points.mjs [--apply]
 */

import { withTransaction, closePool } from '../api/db.mjs';

const PLAYER_SLUG = 'jelly-tax';

async function findBadRows(client) {
  const { rows } = await client.query(
    `select ps.snapshot_id, s.taken_at,
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
      where ps.player_slug = $1 and ps.quest_points = 0
      order by s.taken_at`,
    [PLAYER_SLUG],
  );
  return rows;
}

async function main() {
  const apply = process.argv.includes('--apply');

  await withTransaction(async (client) => {
    const bad = await findBadRows(client);
    if (bad.length === 0) {
      console.log(`No ${PLAYER_SLUG} snapshots with quest_points = 0 — nothing to fix.`);
      return;
    }

    let fixed = 0;
    for (const row of bad) {
      const at = row.taken_at.toISOString();
      const { before_qp: before, after_qp: after } = row;
      if (before === null || after === null || before > after) {
        console.log(`  snapshot ${row.snapshot_id} (${at}): neighbours ${before}/${after} don't give a safe value — skipped`);
        continue;
      }
      // quest points only ever go up, so the true value lies in [before, after];
      // require them equal so the repair isn't a guess.
      if (before !== after) {
        console.log(`  snapshot ${row.snapshot_id} (${at}): neighbours disagree (${before} vs ${after}) — skipped`);
        continue;
      }
      console.log(`  snapshot ${row.snapshot_id} (${at}): quest_points 0 -> ${after}`);
      if (apply) {
        await client.query('update player_snapshots set quest_points = $1 where snapshot_id = $2 and player_slug = $3', [
          after,
          row.snapshot_id,
          PLAYER_SLUG,
        ]);
      }
      fixed += 1;
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
