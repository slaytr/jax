/**
 * Goals + goal labels — the piece that turns goals from "exists only in the
 * browser that created it" (goals-storage.js's own old header comment) into
 * something every viewer of a player's page sees the same copy of. Reads
 * are public (see the plan's Permissions decision); every write needs
 * requireSession + requireOwner, so only the account that claimed a slug
 * can create, edit, or delete that slug's goals.
 *
 * The client still computes a goal's full content itself (buildQuestGoalDrafts
 * in quest-goal.js, the skill dialog in player-goals.js) and posts it
 * ready-made, id included — same "client generates the uuid, server just
 * persists it" model goals-storage.js always used, now backed by Postgres
 * `on conflict (id) do nothing` instead of a localStorage overwrite.
 */

import { query, withTransaction } from '../db.mjs';
import { ok, fail } from '../envelope.mjs';
import { requireSession, requireOwner } from '../auth/session.mjs';
import { projectGoal, projectGoalLabel } from '../projections.mjs';

const VALID_TARGET_TYPES = new Set(['level', 'xp']);

/**
 * Validates one goal draft against goal-goal.js's own shape rather than a
 * declarative JSON schema — the shape is conditional on `kind` (a skill
 * goal and a quest goal share almost no fields), which is awkward to
 * express as a strict-mode ajv oneOf without risking a schema-compile
 * failure at server startup. Returns a human-readable reason, or null if
 * the draft is fine.
 */
function invalidGoalReason(draft) {
  if (!draft || typeof draft !== 'object') return 'not an object';
  if (typeof draft.id !== 'string' || draft.id.length < 8) return 'missing id';
  if (draft.kind !== 'skill' && draft.kind !== 'quest') return 'kind must be "skill" or "quest"';
  if (draft.group !== null && draft.group !== undefined && typeof draft.group !== 'string') return 'group must be a string or null';
  if (draft.labels !== undefined && (!Array.isArray(draft.labels) || !draft.labels.every((label) => typeof label === 'string'))) {
    return 'labels must be an array of strings';
  }
  if (typeof draft.startedAt !== 'string') return 'missing startedAt';
  if (draft.completedAt !== null && draft.completedAt !== undefined && typeof draft.completedAt !== 'string') {
    return 'completedAt must be a string or null';
  }

  if (draft.kind === 'quest') {
    return typeof draft.questName === 'string' && draft.questName.length > 0 ? null : 'quest goal needs questName';
  }

  if (!Number.isInteger(draft.skillId) || draft.skillId < 0 || draft.skillId > 29) return 'skillId must be an integer 0-29';
  if (!VALID_TARGET_TYPES.has(draft.targetType)) return 'targetType must be "level" or "xp"';
  if (!(Number(draft.targetValue) > 0)) return 'targetValue must be a positive number';
  if (!Number.isFinite(Number(draft.startLevel))) return 'missing startLevel';
  if (!Number.isFinite(Number(draft.startXp))) return 'missing startXp';
  return null;
}

async function handleList(request, reply) {
  const { slug } = request.params;
  const [{ rows: goals }, { rows: labels }] = await Promise.all([
    query('select * from goals where player_slug = $1 and deleted_at is null order by started_at asc', [slug]),
    query('select name, colour from goal_labels where player_slug = $1 order by name', [slug]),
  ]);
  return ok(reply, { goals: goals.map(projectGoal), labels: labels.map(projectGoalLabel) });
}

async function insertGoal(client, slug, draft, createdBy) {
  const { rows } = await query(
    `insert into goals
       (id, player_slug, kind, skill_id, target_type, target_value, start_level, start_xp,
        completed_level, completed_xp, quest_name, goal_group, labels, started_at, completed_at, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     on conflict (id) do nothing
     returning *`,
    [
      draft.id,
      slug,
      draft.kind,
      draft.skillId ?? null,
      draft.targetType ?? null,
      draft.targetValue ?? null,
      draft.startLevel ?? null,
      draft.startXp ?? null,
      draft.completedLevel ?? null,
      draft.completedXp ?? null,
      draft.questName ?? null,
      draft.group ?? null,
      draft.labels ?? [],
      draft.startedAt,
      draft.completedAt ?? null,
      createdBy,
    ],
    client,
  );
  return rows[0] ?? null;
}

async function handleCreate(request, reply) {
  const { slug } = request.params;
  const drafts = Array.isArray(request.body?.goals) ? request.body.goals : null;
  if (!drafts || drafts.length === 0) return fail(reply, 400, 'Expected a non-empty "goals" array.');

  for (const draft of drafts) {
    const reason = invalidGoalReason(draft);
    if (reason) return fail(reply, 400, `Invalid goal: ${reason}`);
  }

  // One transaction for the whole batch: a quest goal plus its per-skill
  // requirement siblings (buildQuestGoalDrafts) either all land or none do,
  // never a quest goal with half its requirements missing.
  const created = await withTransaction(async (client) => {
    const rows = [];
    for (const draft of drafts) {
      const row = await insertGoal(client, slug, draft, request.user.discordId);
      if (row) rows.push(row);
    }
    return rows;
  });

  return ok(reply, { goals: created.map(projectGoal) }, 201);
}

const PATCHABLE_COLUMNS = {
  completedAt: 'completed_at',
  completedLevel: 'completed_level',
  completedXp: 'completed_xp',
  labels: 'labels',
  group: 'goal_group',
};

async function handleUpdate(request, reply) {
  const { slug, id } = request.params;
  const patch = request.body ?? {};

  const assignments = [];
  const values = [];
  for (const [key, column] of Object.entries(PATCHABLE_COLUMNS)) {
    if (!(key in patch)) continue;
    values.push(patch[key]);
    assignments.push(`${column} = $${values.length}`);
  }
  if (assignments.length === 0) return fail(reply, 400, 'Nothing patchable in the request body.');

  values.push(slug, id);
  const { rows } = await query(
    `update goals set ${assignments.join(', ')}, updated_at = now()
     where player_slug = $${values.length - 1} and id = $${values.length} and deleted_at is null
     returning *`,
    values,
  );

  if (!rows[0]) return fail(reply, 404, 'No such goal.');
  return ok(reply, { goal: projectGoal(rows[0]) });
}

async function handleDelete(request, reply) {
  const { slug, id } = request.params;
  const { rowCount } = await query(
    'update goals set deleted_at = now() where player_slug = $1 and id = $2 and deleted_at is null',
    [slug, id],
  );
  if (rowCount === 0) return fail(reply, 404, 'No such goal.');
  return ok(reply, { deleted: true });
}

async function handlePutLabel(request, reply) {
  const { slug, name } = request.params;
  const colour = request.body?.colour;
  if (typeof colour !== 'string' || colour.length === 0) return fail(reply, 400, 'colour is required.');

  await query(
    `insert into goal_labels (player_slug, name, colour) values ($1, $2, $3)
     on conflict (player_slug, name) do update set colour = excluded.colour`,
    [slug, name, colour],
  );
  return ok(reply, { name, colour });
}

async function handleDeleteLabel(request, reply) {
  const { slug, name } = request.params;
  await query('delete from goal_labels where player_slug = $1 and name = $2', [slug, name]);
  return ok(reply, { deleted: true });
}

export default async function goalsRoutes(fastify) {
  fastify.get('/api/players/:slug/goals', handleList);
  fastify.post('/api/players/:slug/goals', { preHandler: [requireSession, requireOwner] }, handleCreate);
  fastify.patch('/api/players/:slug/goals/:id', { preHandler: [requireSession, requireOwner] }, handleUpdate);
  fastify.delete('/api/players/:slug/goals/:id', { preHandler: [requireSession, requireOwner] }, handleDelete);
  fastify.put('/api/players/:slug/goal-labels/:name', { preHandler: [requireSession, requireOwner] }, handlePutLabel);
  fastify.delete('/api/players/:slug/goal-labels/:name', { preHandler: [requireSession, requireOwner] }, handleDeleteLabel);
}
