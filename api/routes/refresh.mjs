/**
 * On-demand refresh — POST /api/refresh (whole group) and
 * POST /api/players/:slug/refresh (one player); GET /api/refresh/cooldown
 * (and the per-player equivalent) so a freshly-loaded page can show the
 * right countdown even if someone *else* triggered the last run; GET
 * /api/refresh/:runId for a one-off status check; and GET
 * /api/refresh/stream, a Server-Sent Events feed every connected browser
 * subscribes to so it learns a run finished — its own click or not —
 * without polling. All public: sign-in isn't wired up yet (see
 * AppShell.vue), and there's nothing sensitive here to gate — every route
 * just re-fetches the same public RS3 hiscores data the cron already
 * fetches hourly.
 *
 * Dedup uses a real Postgres advisory lock, not a check against
 * `refresh_runs` rows — a crashed process's lock is released automatically
 * when its connection drops, so it can never wedge future refreshes the
 * way a stuck "running" row could. The lock must be acquired and released
 * on the *same* physical connection (Postgres advisory locks are
 * session-scoped), so this reserves one client from the pool for the
 * whole cycle rather than going through the shared query() helper, which
 * round-robins connections. The POST handlers below don't hold the HTTP
 * request open for that whole cycle, though — see runInBackground.
 */

import { randomUUID } from 'node:crypto';

import { pool, query } from '../db.mjs';
import { ok, fail } from '../envelope.mjs';
import { runGroupUpdateCycle, runSinglePlayerUpdateCycle } from '../jobs/update-job.mjs';

// One manual refresh per scope per COOLDOWN_MS. Derived from `refresh_runs`
// itself — a real, shared, DB-backed clock — rather than in-memory state,
// so it reads the same everywhere (a second Railway deploy, a page loaded
// on a different device) and survives a restart instead of quietly
// resetting. The advisory lock above only dedupes *concurrent* runs; this
// is what stops a burst of sequential clicks once each one finishes.
const COOLDOWN_MS = 60 * 1000;

async function lastStartedAt(scope, playerSlug) {
  const { rows } = await query(
    `select started_at from refresh_runs
     where scope = $1 and coalesce(player_slug, '') = coalesce($2, '')
     order by started_at desc limit 1`,
    [scope, playerSlug],
  );
  return rows[0]?.started_at ?? null;
}

/** Seconds left in the cooldown, or null once it's clear — reused by the
 * POST handlers (to reject a too-soon trigger) and the GET /cooldown
 * endpoints (so a page that didn't do the triggering can still show the
 * right countdown on load). */
async function cooldownRemaining(scope, playerSlug) {
  const startedAt = await lastStartedAt(scope, playerSlug);
  if (!startedAt) return null;
  const elapsed = Date.now() - new Date(startedAt).getTime();
  if (elapsed >= COOLDOWN_MS) return null;
  return Math.ceil((COOLDOWN_MS - elapsed) / 1000);
}

// Advisory-lock namespace: classid distinguishes a group-scope lock from a
// per-player one so a player slug's hash can never collide with the fixed
// group key. objid is 0 (arbitrary) for the group lock, hashtext(slug) for
// a player lock.
const LOCK_CLASS_GROUP = 1;
const LOCK_CLASS_PLAYER = 2;

/**
 * Every currently-connected /api/refresh/stream client, as a plain
 * "write this SSE frame" function — this process is the only place that
 * knows who's listening (a single web-service instance, same reasoning as
 * the advisory lock needing one dedicated connection), so a plain Set is
 * enough; nothing here needs to survive a restart the way the cooldown
 * does.
 */
const sseClients = new Set();

function broadcastRunFinished(scope, playerSlug, status) {
  const frame = `event: run-finished\ndata: ${JSON.stringify({ scope, playerSlug, status })}\n\n`;
  for (const send of sseClients) send(frame);
}

/**
 * Acquires `pg_try_advisory_lock(classId, objId)` on its own dedicated
 * connection and, if successful, hands back a `release()` that unlocks and
 * returns the connection to the pool. The caller decides when to call it —
 * unlike a plain try/finally wrapper, this lets the lock outlive the HTTP
 * request that acquired it, which is exactly what runInBackground needs.
 */
async function tryAcquireLock(classId, objId) {
  const client = await pool.connect();
  const { rows } = await client.query('select pg_try_advisory_lock($1, $2) as acquired', [classId, objId]);
  if (!rows[0].acquired) {
    client.release();
    return null;
  }
  return async () => {
    await client.query('select pg_advisory_unlock($1, $2)', [classId, objId]);
    client.release();
  };
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

async function finishRun(scope, playerSlug, runId, { ok: succeeded, error = null, detail = null }) {
  await query(
    `update refresh_runs set status = $2, finished_at = now(), error = $3, detail = $4 where id = $1`,
    [runId, succeeded ? 'ok' : 'failed', error, detail ? JSON.stringify(detail) : null],
  );
  broadcastRunFinished(scope, playerSlug, succeeded ? 'ok' : 'failed');
}

/** Runs `cycle()` to completion in the background — the caller (a POST
 * handler) has already responded by the time this settles. Whoever's
 * listening on /api/refresh/stream (any tab, not just the one that
 * clicked) is how the result actually reaches a browser. */
function runInBackground(cycle, { scope, playerSlug, runId, release }) {
  cycle()
    .then((detail) => finishRun(scope, playerSlug, runId, { ok: true, detail }))
    .catch((error) => finishRun(scope, playerSlug, runId, { ok: false, error: error.message }))
    .finally(release);
}

async function handleGroupRefresh(request, reply) {
  const retryAfter = await cooldownRemaining('group', null);
  if (retryAfter !== null) return fail(reply, 429, `Refreshed too recently — try again in ${retryAfter}s.`);

  const release = await tryAcquireLock(LOCK_CLASS_GROUP, 0);
  if (!release) {
    // Already running (started via the cron, or another tab's click that
    // slipped in first) — hand back that run's id rather than starting a
    // second one; the caller's own /stream subscription still sees it finish.
    const runningId = await currentRunningRun('group', null);
    return ok(reply, { runId: runningId, status: 'running' }, 202);
  }

  const runId = await startRun('group', null, request.user?.discordId ?? null);
  runInBackground(runGroupUpdateCycle, { scope: 'group', playerSlug: null, runId, release });
  return ok(reply, { runId }, 202);
}

async function handlePlayerRefresh(request, reply) {
  const { slug } = request.params;
  const retryAfter = await cooldownRemaining('player', slug);
  if (retryAfter !== null) return fail(reply, 429, `Refreshed too recently — try again in ${retryAfter}s.`);

  const { rows } = await query('select hashtext($1) as key', [slug]);
  const release = await tryAcquireLock(LOCK_CLASS_PLAYER, rows[0].key);
  if (!release) {
    const runningId = await currentRunningRun('player', slug);
    return ok(reply, { runId: runningId, status: 'running' }, 202);
  }

  const runId = await startRun('player', slug, request.user?.discordId ?? null);
  runInBackground(() => runSinglePlayerUpdateCycle(slug), { scope: 'player', playerSlug: slug, runId, release });
  return ok(reply, { runId }, 202);
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

async function handleGroupCooldown(request, reply) {
  const retryAfterSeconds = await cooldownRemaining('group', null);
  return ok(reply, { active: retryAfterSeconds !== null, retryAfterSeconds });
}

async function handlePlayerCooldown(request, reply) {
  const retryAfterSeconds = await cooldownRemaining('player', request.params.slug);
  return ok(reply, { active: retryAfterSeconds !== null, retryAfterSeconds });
}

/**
 * text/event-stream — one frame per finished run, `{scope, playerSlug,
 * status}`. `reply.hijack()` tells Fastify this response is handled by
 * hand from here on; without it, Fastify would try to send its own
 * response once this handler returns, which for a connection meant to
 * stay open indefinitely is never what's wanted.
 */
async function handleStream(request, reply) {
  reply.hijack();
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  reply.raw.write(':ok\n\n');

  const send = (frame) => {
    try {
      reply.raw.write(frame);
    } catch {
      // The write raced a close that the 'close' listener below hasn't
      // processed yet — nothing to do, that listener still runs and
      // removes this client.
    }
  };
  sseClients.add(send);

  // Proxies and idle browser tabs both drop a connection with nothing on
  // it for a while — a comment frame every 25s keeps this one open.
  const heartbeat = setInterval(() => send(':heartbeat\n\n'), 25000);

  request.raw.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(send);
  });
}

export default async function refreshRoutes(fastify) {
  fastify.post('/api/refresh', handleGroupRefresh);
  fastify.post('/api/players/:slug/refresh', handlePlayerRefresh);
  fastify.get('/api/refresh/cooldown', handleGroupCooldown);
  fastify.get('/api/players/:slug/refresh/cooldown', handlePlayerCooldown);
  fastify.get('/api/refresh/stream', handleStream);
  fastify.get('/api/refresh/:runId', handleRunStatus);
}
