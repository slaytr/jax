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

import { withTransaction, closePool } from '../api/db.mjs';
import { upsertRoster, upsertLatest, insertSnapshotEntry } from '../api/store/upserts.mjs';

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
    await upsertRoster(client, roster);
    console.log(`Roster: ${roster.players.length} players.`);

    await upsertLatest(client, latest);
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
