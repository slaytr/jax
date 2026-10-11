/**
 * "First to 99 / first to 120" bookkeeping — see migrations/003. The table's
 * (skill_id, tier) primary key does the real work: `on conflict do nothing`
 * means only the first player ever recorded for a skill+tier keeps it.
 */

import { query } from '../db.mjs';

/**
 * Records any milestone the given snapshot newly shows. Same query as the
 * migration's backfill, restricted to one snapshot. When two players cross in
 * the same snapshot, the one with more xp in that skill wins (slug as the
 * final tiebreak). Call inside the same transaction as the snapshot insert.
 */
export async function recordMilestones(client, snapshotId) {
  await client.query(
    `insert into skill_milestones (skill_id, tier, player_slug, reached_at)
     select distinct on (g.skill_id, t.tier)
            g.skill_id, t.tier, ps.player_slug, s.taken_at
     from snapshots s
     join player_snapshots ps on ps.snapshot_id = s.id and ps.levels is not null
     cross join generate_series(1, 29) as g(skill_id)
     cross join (values (99), (120)) as t(tier)
     where s.id = $1 and ps.levels[g.skill_id + 1] >= t.tier
     order by g.skill_id, t.tier, ps.xp[g.skill_id + 1] desc, ps.player_slug asc
     on conflict do nothing`,
    [snapshotId],
  );
}

/**
 * Rebuilds the whole table from recorded history — the same query as
 * migration 003's backfill. For callers that replace snapshot history
 * wholesale (scripts/sync-from-prod.mjs's truncate-and-reload wipes this
 * table via its FK to players, and production's own copy may not carry it
 * yet), where re-deriving beats trying to copy it.
 */
export async function rebuildMilestones(client) {
  await client.query('delete from skill_milestones');
  await client.query(
    `insert into skill_milestones (skill_id, tier, player_slug, reached_at)
     select distinct on (g.skill_id, t.tier)
            g.skill_id, t.tier, ps.player_slug, s.taken_at
     from snapshots s
     join player_snapshots ps on ps.snapshot_id = s.id and ps.levels is not null
     cross join generate_series(1, 29) as g(skill_id)
     cross join (values (99), (120)) as t(tier)
     where ps.levels[g.skill_id + 1] >= t.tier
     order by g.skill_id, t.tier, s.taken_at asc, ps.xp[g.skill_id + 1] desc, ps.player_slug asc
     on conflict do nothing`,
  );
}

/** Every recorded milestone, grouped by holder's slug. */
export async function fetchMilestonesByPlayer() {
  const { rows } = await query(
    'select skill_id, tier, player_slug, reached_at from skill_milestones order by tier, skill_id',
  );
  const byPlayer = new Map();
  for (const row of rows) {
    const list = byPlayer.get(row.player_slug) ?? [];
    byPlayer.set(row.player_slug, [...list, row]);
  }
  return byPlayer;
}
