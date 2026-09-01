#!/usr/bin/env node
/**
 * One-time (but idempotent — safe to re-run) load of everything currently
 * committed as JSON into Postgres: data/players.json, data/latest.json,
 * data/history/**, quest-data/quests.json.
 *
 * Every write is an upsert, so re-running after more cron commits have
 * landed on main (see the plan's Branching section) just fills in whatever
 * is new — nothing needs to be truncated first.
 *
 * Usage: node scripts/backfill.mjs
 */

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { pool, withTransaction, closePool } from '../api/db.mjs';
import { SKILL_COUNT } from './hiscores.mjs';

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

async function backfillRoster(client, roster) {
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

async function backfillLatest(client, latest) {
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
        latest.fetchedAt,
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
}

/** Pads a sparse per-skill-id vector (only some ids present, as in older
 * shards) out to SKILL_COUNT — a history snapshot's `p`/`l` are already
 * dense arrays in practice, but this keeps the insert honest either way. */
function toVector(value) {
  const vector = new Array(SKILL_COUNT).fill(0);
  if (Array.isArray(value)) {
    for (let i = 0; i < Math.min(value.length, SKILL_COUNT); i += 1) vector[i] = value[i] ?? 0;
  }
  return vector;
}

async function backfillHistory(client) {
  const files = await historyFiles();
  let snapshotCount = 0;
  let playerSnapshotCount = 0;

  for (const file of files) {
    const shard = await readJson(file);
    if (!Array.isArray(shard?.snapshots)) continue;

    for (const snapshot of shard.snapshots) {
      const takenAt = new Date(snapshot.t * 1000).toISOString();
      const { rows } = await client.query(
        `insert into snapshots (taken_at, group_rank) values ($1, $2)
         on conflict (taken_at) do update set group_rank = excluded.group_rank
         returning id`,
        [takenAt, snapshot.r ?? null],
      );
      const snapshotId = rows[0].id;
      snapshotCount += 1;

      const slugs = Object.keys(snapshot.p ?? {});
      for (const slug of slugs) {
        // snapshot.l is absent entirely on pre-schema-upgrade snapshots
        // (see the levels column comment in the migration) — NULL, not a
        // zero vector, preserves that "no data" distinction.
        const levels = snapshot.l ? toVector(snapshot.l[slug]) : null;
        await client.query(
          `insert into player_snapshots (snapshot_id, player_slug, xp, levels, quest_points)
           values ($1, $2, $3, $4, $5)
           on conflict (snapshot_id, player_slug) do update set
             xp = excluded.xp, levels = excluded.levels, quest_points = excluded.quest_points`,
          [snapshotId, slug, toVector(snapshot.p[slug]), levels, snapshot.q?.[slug] ?? null],
        );
        playerSnapshotCount += 1;
      }
    }
  }

  return { files: files.length, snapshots: snapshotCount, playerSnapshots: playerSnapshotCount };
}

async function backfillQuests(client, questData) {
  if (!questData) return { quests: 0 };

  for (const quest of questData.quests ?? []) {
    await client.query(
      `insert into quests
         (name, slug, wiki_url, quest_type, subquest_of, difficulty, length, members, series,
          series_position, age, start_area, combat_level, release_date, removal_date,
          misc_requirements, full_completion_requirements)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       on conflict (name) do update set
         slug = excluded.slug, wiki_url = excluded.wiki_url, quest_type = excluded.quest_type,
         subquest_of = excluded.subquest_of, difficulty = excluded.difficulty, length = excluded.length,
         members = excluded.members, series = excluded.series, series_position = excluded.series_position,
         age = excluded.age, start_area = excluded.start_area, combat_level = excluded.combat_level,
         release_date = excluded.release_date, removal_date = excluded.removal_date,
         misc_requirements = excluded.misc_requirements,
         full_completion_requirements = excluded.full_completion_requirements`,
      [
        quest.name,
        quest.slug,
        quest.wikiUrl ?? null,
        quest.questType ?? null,
        quest.subquestOf ?? null,
        quest.difficulty ?? null,
        quest.length ?? null,
        quest.members ?? null,
        quest.series ?? null,
        quest.seriesPosition ?? null,
        quest.age ?? null,
        quest.startArea ?? null,
        quest.combatLevel ?? null,
        quest.releaseDate ?? null,
        quest.removalDate ?? null,
        JSON.stringify(quest.miscRequirements ?? []),
        JSON.stringify(quest.fullCompletionRequirements ?? []),
      ],
    );

    await client.query('delete from quest_skill_requirements where quest_name = $1', [quest.name]);
    for (const [position, req] of (quest.skillRequirements ?? []).entries()) {
      await client.query('insert into quest_skill_requirements (quest_name, skill, level, position) values ($1, $2, $3, $4)', [
        quest.name,
        req.skill,
        req.level,
        position,
      ]);
    }

    await client.query('delete from quest_prerequisites where quest_name = $1', [quest.name]);
    // questRequirements and recommendedQuests are numbered independently —
    // each is its own source array with its own display order, split back
    // apart on read by projectQuest() filtering on `relation`.
    const required = (quest.questRequirements ?? []).map((req, position) => [quest.name, req.quest, req.relation, position]);
    const recommended = (quest.recommendedQuests ?? []).map((req, position) => [quest.name, req.quest, 'recommended', position]);
    for (const row of [...required, ...recommended]) {
      await client.query(
        `insert into quest_prerequisites (quest_name, requires, relation, position) values ($1, $2, $3, $4)
         on conflict (quest_name, requires, relation) do update set position = excluded.position`,
        row,
      );
    }
  }

  return { quests: questData.quests?.length ?? 0 };
}

async function main() {
  const roster = await readJson(join(DATA_DIR, 'players.json'));
  if (!roster) throw new Error('data/players.json not found — nothing to backfill from.');

  const latest = await readJson(join(DATA_DIR, 'latest.json'));
  const questData = await readJson(join(ROOT, 'quest-data', 'quests.json'));

  await withTransaction(async (client) => {
    await backfillRoster(client, roster);
    console.log(`Roster: ${roster.players.length} players.`);

    await backfillLatest(client, latest);
    console.log(latest ? `Latest: ${latest.players?.length ?? 0} player states.` : 'Latest: no data/latest.json, skipped.');

    const historyResult = await backfillHistory(client);
    console.log(
      `History: ${historyResult.files} shard file(s), ${historyResult.snapshots} snapshot(s), ${historyResult.playerSnapshots} player-snapshot(s).`,
    );

    const questResult = await backfillQuests(client, questData);
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
