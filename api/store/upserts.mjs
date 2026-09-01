/**
 * The upsert statements shared by scripts/backfill.mjs (one-time load from
 * committed JSON) and api/store/write-run.mjs (the ongoing per-cycle
 * writer) — both hand these the exact same shapes runUpdate()
 * (scripts/update.mjs) and the roster/history JSON files have always used,
 * so there's one place that knows how to turn `players.json`'s roster,
 * `latest.json`'s player states, and a history shard's snapshot entry into
 * rows, not two copies drifting apart.
 *
 * Every function here takes the transaction `client` explicitly rather
 * than reaching for the shared pool — callers wrap these in
 * withTransaction() (db.mjs) so a roster sync, a latest.json write, and a
 * snapshot insert either all land together or none do.
 */

import { SKILL_COUNT } from '../../scripts/hiscores.mjs';

export async function upsertRoster(client, roster) {
  const group = roster.group ?? { name: 'Group', tagline: '' };
  await client.query(
    `insert into groups (id, name, tagline, hiscores_url)
     values (1, $1, $2, $3)
     on conflict (id) do update set name = excluded.name, tagline = excluded.tagline, hiscores_url = excluded.hiscores_url`,
    [group.name, group.tagline ?? '', group.hiscoresUrl ?? ''],
  );

  for (const [index, player] of roster.players.entries()) {
    await client.query(
      `insert into players (slug, name, hiscore_table, position)
       values ($1, $2, $3, $4)
       on conflict (slug) do update set name = excluded.name, hiscore_table = excluded.hiscore_table, position = excluded.position`,
      [player.slug, player.name, player.table ?? 'main', index],
    );
  }
}

/** One player's `player_state` + `player_quest_status` rows — factored out
 * of upsertLatest() below so a single-player refresh (POST
 * /api/players/:slug/refresh) can update exactly one player's state
 * without touching the other four, which a loop over a full `latest`
 * object has no way to do. */
export async function upsertPlayerState(client, fetchedAt, player) {
  await client.query(
    `insert into player_state
       (player_slug, fetched_at, stale, error, total_level, total_xp, total_rank,
        quest_points, quests_complete, quests_stale, skills, activities)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     on conflict (player_slug) do update set
       fetched_at = excluded.fetched_at, stale = excluded.stale, error = excluded.error,
       total_level = excluded.total_level, total_xp = excluded.total_xp, total_rank = excluded.total_rank,
       quest_points = excluded.quest_points, quests_complete = excluded.quests_complete,
       quests_stale = excluded.quests_stale, skills = excluded.skills, activities = excluded.activities`,
    [
      player.slug,
      fetchedAt,
      player.stale ?? false,
      player.error ?? null,
      player.total?.level ?? 0,
      player.total?.xp ?? 0,
      player.total?.rank ?? null,
      player.questPoints ?? null,
      player.questsComplete ?? null,
      player.questsStale ?? false,
      JSON.stringify(player.skills ?? []),
      JSON.stringify(player.activities ?? []),
    ],
  );

  await client.query('delete from player_quest_status where player_slug = $1', [player.slug]);
  const completed = (player.completedQuests ?? []).map((name) => [player.slug, name, 'completed']);
  const started = (player.startedQuests ?? []).map((name) => [player.slug, name, 'started']);
  for (const row of [...completed, ...started]) {
    await client.query(
      `insert into player_quest_status (player_slug, quest_name, status) values ($1, $2, $3)
       on conflict (player_slug, quest_name) do update set status = excluded.status`,
      row,
    );
  }
}

export async function upsertLatest(client, latest) {
  if (!latest) return;

  if (latest.trackingSince) {
    await client.query('update groups set tracking_since = $1 where id = 1', [latest.trackingSince]);
  }

  const rank = latest.groupRank;
  if (rank) {
    await client.query(
      `insert into group_state
         (id, rank, total_level, total_xp, size, founder, external_id, competitive, total_groups, rivals, source_url, stale, error, checked_at)
       values (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       on conflict (id) do update set
         rank = excluded.rank, total_level = excluded.total_level, total_xp = excluded.total_xp,
         size = excluded.size, founder = excluded.founder, external_id = excluded.external_id,
         competitive = excluded.competitive, total_groups = excluded.total_groups, rivals = excluded.rivals,
         source_url = excluded.source_url, stale = excluded.stale, error = excluded.error, checked_at = excluded.checked_at`,
      [
        rank.rank,
        rank.totalLevel,
        rank.totalXp,
        rank.size,
        rank.founder,
        rank.id,
        rank.competitive,
        rank.totalGroups,
        JSON.stringify(rank.rivals ?? []),
        rank.sourceUrl,
        rank.stale,
        rank.error,
        rank.checkedAt,
      ],
    );
  }

  for (const player of latest.players ?? []) {
    await upsertPlayerState(client, latest.fetchedAt, player);
  }
}

/** Pads a sparse per-skill-id vector out to SKILL_COUNT — a snapshot's
 * `p`/`l` are already dense arrays in practice, but this keeps the insert
 * honest either way (and matches scripts/snapshots.mjs's own vectorOf()). */
function toVector(value) {
  const vector = new Array(SKILL_COUNT).fill(0);
  if (Array.isArray(value)) {
    for (let i = 0; i < Math.min(value.length, SKILL_COUNT); i += 1) vector[i] = value[i] ?? 0;
  }
  return vector;
}

/**
 * Inserts one `{t,p,l,r,q}` snapshot entry (a history shard's own shape,
 * and exactly what toSnapshot() in scripts/snapshots.mjs produces) —
 * `snapshots` row plus one `player_snapshots` row per player present in
 * `p`. `on conflict do update` on the `taken_at` unique constraint makes
 * this safe to re-run for the same instant (the backfill's own
 * idempotency requirement); the ongoing writer never actually hits that
 * conflict path since every real update cycle has a fresh timestamp.
 */
export async function insertSnapshotEntry(client, snapshot) {
  const takenAt = new Date(snapshot.t * 1000).toISOString();
  const { rows } = await client.query(
    `insert into snapshots (taken_at, group_rank) values ($1, $2)
     on conflict (taken_at) do update set group_rank = excluded.group_rank
     returning id`,
    [takenAt, snapshot.r ?? null],
  );
  const snapshotId = rows[0].id;

  const slugs = Object.keys(snapshot.p ?? {});
  for (const slug of slugs) {
    // snapshot.l is absent entirely on pre-schema-upgrade snapshots (see
    // the levels column comment in the migration) — NULL, not a zero
    // vector, preserves that "no data" distinction.
    const levels = snapshot.l ? toVector(snapshot.l[slug]) : null;
    await client.query(
      `insert into player_snapshots (snapshot_id, player_slug, xp, levels, quest_points)
       values ($1, $2, $3, $4, $5)
       on conflict (snapshot_id, player_slug) do update set
         xp = excluded.xp, levels = excluded.levels, quest_points = excluded.quest_points`,
      [snapshotId, slug, toVector(snapshot.p[slug]), levels, snapshot.q?.[slug] ?? null],
    );
  }

  return { snapshotId, playerCount: slugs.length };
}
