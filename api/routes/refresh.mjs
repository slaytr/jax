/**
 * On-demand refresh — POST /api/refresh (whole group, any owner) and
 * POST /api/players/:slug/refresh (one player, must own that slug), plus
 * the public GET /api/refresh/:runId status poll. See the plan's Refresh
 * decision.
 *
 * Dedup uses a real Postgres advisory lock, not a check against
 * `refresh_runs` rows — a crashed process's lock is released automatically
 * when its connection drops, so it can never wedge future refreshes the
 * way a stuck "running" row could. The lock must be acquired and released
 * on the *same* physical connection (Postgres advisory locks are
 * session-scoped), so this reserves one client from the pool for the
 * whole cycle rather than going through the shared query() helper, which
 * round-robins connections.
 */

import { randomUUID } from 'node:crypto';

import { pool, query } from '../db.mjs';
import { ok, fail } from '../envelope.mjs';
import { requireSession, requireOwner, requireAnyOwner } from '../auth/session.mjs';
import { runGroupUpdateCycle, runSinglePlayerUpdateCycle } from '../jobs/update-job.mjs';

// Advisory-lock namespace: classid distinguishes a group-scope lock from a
// per-player one so a player slug's hash can never collide with the fixed
// group key. objid is 0 (arbitrary) for the group lock, hashtext(slug) for
// a player lock.
const LOCK_CLASS_GROUP = 1;
const LOCK_CLASS_PLAYER = 2;

/**
 * Tries to take `pg_try_advisory_lock(classId, objId)` on a single
 * dedicated connection. If acquired, runs `fn()` and releases the lock on
 * that same connection before returning; if not, returns immediately
 * without ever running `fn`. Either way the connection goes back to the
 * pool in a `finally`.
 */
async function withAdvisoryLock(classId, objId, fn) {
  const client = await pool.connect();
  try {
    const { rows } = await client.query('select pg_try_advisory_lock($1, $2) as acquired', [classId, objId]);
    if (!rows[0].acquired) return { acquired: false };

    try {
      const result = await fn();
      return { acquired: true, result };
    } finally {
      await client.query('select pg_advisory_unlock($1, $2)', [classId, objId]);
    }
  } finally {
    client.release();
  }
}

async function currentRunningRun(scope, playerSlug) {
  const { rows } = await query(
    `select id from refresh_runs
     where scope = $1 and status = 'running' and coalesce(player_slug, '') = coalesce($2, '')
     order by started_at desc limit 1`,
    [scope, playerSlug],
  );
  return rows[0]?.id ?? null;
}

async function startRun(scope, playerSlug, requestedBy) {
  const id = randomUUID();
  await query('insert into refresh_runs (id, scope, player_slug, requested_by, status) values ($1, $2, $3, $4, \'running\')', [
    id,
    scope,
    playerSlug,
    requestedBy,
  ]);
  return id;
}

async function finishRun(runId, { ok: succeeded, error = null, detail = null }) {
  await query(
    `update refresh_runs set status = $2, finished_at = now(), error = $3, detail = $4 where id = $1`,
    [runId, succeeded ? 'ok' : 'failed', error, detail ? JSON.stringify(detail) : null],
  );
}

async function handleGroupRefresh(request, reply) {
  const lockOutcome = await withAdvisoryLock(LOCK_CLASS_GROUP, 0, async () => {
    const runId = await startRun('group', null, request.user.discordId);
    try {
      const summary = await runGroupUpdateCycle();
      await finishRun(runId, { ok: true, detail: summary });
      return runId;
    } catch (error) {
      await finishRun(runId, { ok: false, error: error.message });
      throw error;
    }
  });

  if (lockOutcome.acquired) {
    return ok(reply, { runId: lockOutcome.result }, 202);
  }

  // Already running somewhere — hand back the in-flight run's id so the
  // caller can poll the same one instead of being told to try again later.
  const runningId = await currentRunningRun('group', null);
  return ok(reply, { runId: runningId, status: 'running' }, 202);
}

async function handlePlayerRefresh(request, reply) {
  const { slug } = request.params;
  const { rows } = await query('select hashtext($1) as key', [slug]);
  const lockKey = rows[0].key;

  const lockOutcome = await withAdvisoryLock(LOCK_CLASS_PLAYER, lockKey, async () => {
    const runId = await startRun('player', slug, request.user.discordId);
    try {
      const result = await runSinglePlayerUpdateCycle(slug);
      await finishRun(runId, { ok: result.ok, error: result.ok ? null : result.error });
      return runId;
    } catch (error) {
      await finishRun(runId, { ok: false, error: error.message });
      throw error;
    }
  });

  if (lockOutcome.acquired) {
    return ok(reply, { runId: lockOutcome.result }, 202);
  }

  const runningId = await currentRunningRun('player', slug);
  return ok(reply, { runId: runningId, status: 'running' }, 202);
}

async function handleRunStatus(request, reply) {
  const { rows } = await query('select status, started_at, finished_at, error from refresh_runs where id = $1', [request.params.runId]);
  if (!rows[0]) return fail(reply, 404, 'No such run.');
  const row = rows[0];
  return ok(reply, {
    status: row.status,
    startedAt: row.started_at instanceof Date ? row.started_at.toISOString() : row.started_at,
    finishedAt: row.finished_at instanceof Date ? row.finished_at.toISOString() : row.finished_at,
    error: row.error,
  });
}

export default async function refreshRoutes(fastify) {
  fastify.post('/api/refresh', { preHandler: [requireSession, requireAnyOwner] }, handleGroupRefresh);
  fastify.post('/api/players/:slug/refresh', { preHandler: [requireSession, requireOwner] }, handlePlayerRefresh);
  fastify.get('/api/refresh/:runId', handleRunStatus);
}
