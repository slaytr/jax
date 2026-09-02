/**
 * Reads the database's current state back out in the same shapes
 * runUpdate() (scripts/update.mjs) produces and consumes — the projected
 * latest.json shape, and the single most recent history snapshot in
 * `{t,p,l,r,q}` form. Two callers share this:
 *
 * - api/routes/read.mjs's GET /api/latest, so the read path and the write
 *   path agree on exactly one "what does latest.json look like" query.
 * - api/jobs/update-job.mjs, which needs both as the `previousLatest` and
 *   redundancy-check inputs runUpdate()/isRedundant() were always handed
 *   when main() read them off disk.
 */

import { query } from '../db.mjs';
import { projectLatest, projectHistory } from '../projections.mjs';

/** Exported too — handleHistory (routes/read.mjs) needs just
 * `tracking_since` to bound how far back a history query looks. */
export async function fetchGroup() {
  const { rows } = await query('select name, tagline, hiscores_url, tracking_since from groups where id = 1');
  return rows[0] ?? null;
}

async function fetchGroupRankRow() {
  const { rows } = await query('select * from group_state where id = 1');
  return rows[0] ?? null;
}

async function fetchPlayerStateRows() {
  const { rows } = await query(`
    select p.slug, p.name, p.hiscore_table, p.position,
           ps.fetched_at, ps.stale, ps.error, ps.total_level, ps.total_xp, ps.total_rank,
           ps.quest_points, ps.quests_complete, ps.quests_stale, ps.skills, ps.activities, ps.latest_activity
    from players p
    left join player_state ps on ps.player_slug = p.slug
    order by p.position
  `);
  return rows;
}

async function fetchQuestStatusByPlayer() {
  const { rows } = await query('select player_slug, quest_name, status from player_quest_status');
  const byPlayer = new Map();
  for (const row of rows) {
    if (!byPlayer.has(row.player_slug)) byPlayer.set(row.player_slug, { completedQuests: [], startedQuests: [] });
    const bucket = byPlayer.get(row.player_slug);
    if (row.status === 'completed') bucket.completedQuests.push(row.quest_name);
    else bucket.startedQuests.push(row.quest_name);
  }
  return byPlayer;
}

const latestFetchedAt = (playerRows) => {
  const timestamps = playerRows.map((row) => row.fetched_at).filter(Boolean);
  if (timestamps.length === 0) return null;
  const max = timestamps.reduce((latest, current) => (current > latest ? current : latest));
  return max instanceof Date ? max.toISOString() : max;
};

/** The full projected latest.json shape, or null if the DB has no `groups`
 * row yet (migrated but never backfilled/updated). */
export async function readCurrentLatest() {
  const group = await fetchGroup();
  if (!group) return null;

  const [groupRankRow, playerRows, questStatusByPlayer] = await Promise.all([
    fetchGroupRankRow(),
    fetchPlayerStateRows(),
    fetchQuestStatusByPlayer(),
  ]);

  const players = playerRows.map((row) => ({
    ...row,
    ...(questStatusByPlayer.get(row.slug) ?? { completedQuests: [], startedQuests: [] }),
  }));

  return projectLatest({
    fetchedAt: latestFetchedAt(playerRows),
    trackingSince: group.tracking_since instanceof Date ? group.tracking_since.toISOString() : group.tracking_since,
    group,
    groupRankRow,
    players,
  });
}

/** The single most recent snapshot, in the same `{t,p,l,r,q}` shape a
 * history shard entry has always had — isRedundant() (snapshots.mjs)
 * compares a freshly-fetched snapshot against exactly this shape. Null if
 * there's no history yet. */
export async function readMostRecentSnapshot() {
  const { rows } = await query(
    `select ps.player_slug, ps.xp, ps.levels, ps.quest_points, s.taken_at, s.group_rank
     from snapshots s
     join player_snapshots ps on ps.snapshot_id = s.id
     where s.taken_at = (select max(taken_at) from snapshots)`,
  );
  if (rows.length === 0) return null;
  return projectHistory(rows)[0];
}
