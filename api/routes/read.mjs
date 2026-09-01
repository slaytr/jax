/**
 * The three public, no-session read routes: /api/latest (replaces
 * data/latest.json), /api/history (replaces the 33 sharded history fetches),
 * /api/quests (replaces quest-data/quests.json). All three do their own
 * querying here and hand the rows to api/projections.mjs, which is the only
 * place that knows how to shape them back into what the front end expects.
 */

import { query } from '../db.mjs';
import { ok, fail } from '../envelope.mjs';
import { projectHistory, projectQuest, projectQuests } from '../projections.mjs';
import { readCurrentLatest, fetchGroup } from '../store/current-state.mjs';

const DEFAULT_HISTORY_DAYS = 33;
const MAX_HISTORY_DAYS = 366;

async function handleLatest(request, reply) {
  const data = await readCurrentLatest();
  if (!data) {
    return fail(reply, 503, 'Not initialized yet — run the migration and an update before the API has anything to serve.');
  }
  return ok(reply, data);
}

async function handleHistory(request, reply) {
  const requestedDays = Number(request.query?.days ?? DEFAULT_HISTORY_DAYS);
  const days = Number.isFinite(requestedDays) && requestedDays > 0 ? Math.min(requestedDays, MAX_HISTORY_DAYS) : DEFAULT_HISTORY_DAYS;

  const group = await fetchGroup();
  const trackingSince = group?.tracking_since ? new Date(group.tracking_since) : null;
  const windowStart = new Date(Date.now() - days * 86_400_000);
  // Never look back further than trackingSince, same reasoning as
  // data.js's loadRecentHistory: a group in its first weeks has nothing to
  // find past that point, so there's no reason to make Postgres scan for it.
  const earliest = trackingSince && trackingSince > windowStart ? trackingSince : windowStart;

  const { rows } = await query(
    `select s.taken_at, s.group_rank, ps.player_slug, ps.xp, ps.levels, ps.quest_points
     from snapshots s
     join player_snapshots ps on ps.snapshot_id = s.id
     where s.taken_at >= $1
     order by s.taken_at asc`,
    [earliest.toISOString()],
  );

  return ok(reply, { snapshots: projectHistory(rows) });
}

async function handleQuests(request, reply) {
  const [{ rows: quests }, { rows: skillReqs }, { rows: prereqs }] = await Promise.all([
    query('select * from quests order by name'),
    query('select * from quest_skill_requirements order by quest_name, position'),
    query('select * from quest_prerequisites order by quest_name, position'),
  ]);

  const skillReqsByQuest = new Map();
  for (const row of skillReqs) {
    if (!skillReqsByQuest.has(row.quest_name)) skillReqsByQuest.set(row.quest_name, []);
    skillReqsByQuest.get(row.quest_name).push(row);
  }

  const prereqsByQuest = new Map();
  for (const row of prereqs) {
    if (!prereqsByQuest.has(row.quest_name)) prereqsByQuest.set(row.quest_name, []);
    prereqsByQuest.get(row.quest_name).push(row);
  }

  const projected = quests.map((row) =>
    projectQuest(row, {
      skillRequirements: skillReqsByQuest.get(row.name) ?? [],
      prerequisites: prereqsByQuest.get(row.name) ?? [],
    }),
  );

  return ok(reply, projectQuests(projected));
}

export default async function readRoutes(fastify) {
  fastify.get('/api/latest', handleLatest);
  fastify.get('/api/history', handleHistory);
  fastify.get('/api/quests', handleQuests);
}
