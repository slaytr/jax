#!/usr/bin/env node
/**
 * The one Railway web service: serves the built Vue SPA (web/dist, which
 * now covers both / and /stats/:slug — see web/src/router.ts) and
 * everything under /api/* and /auth/*, all from the same origin. That's
 * the whole reason this replaces GitHub Pages: a session cookie can be
 * HttpOnly + SameSite=Lax with no CORS involved only if the site and the
 * API answer the same origin.
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCookie from '@fastify/cookie';

import readRoutes from './routes/read.mjs';
import authRoutes from './routes/auth.mjs';
import goalsRoutes from './routes/goals.mjs';
import refreshRoutes from './routes/refresh.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'web', 'dist');
const DIST_INDEX = join(DIST, 'index.html');
const PORT = Number(process.env.PORT ?? 4173);

// Routes the SPA fallback (below) must never claim — an unmatched request
// under any of these falls through to each plugin's own 404 instead of
// getting index.html. /stats/:slug is a real client-side route now (see
// web/src/router.ts) so it's deliberately NOT in this list — a request for
// it should reach the fallback and get index.html, same as any other
// client-side path.
const NON_SPA_PREFIXES = ['/api', '/auth', '/healthz', '/assets'];

export async function buildServer() {
  const fastify = Fastify({ logger: process.env.NODE_ENV !== 'test' });

  await fastify.register(fastifyCookie, { secret: process.env.SESSION_SECRET });

  const hasDist = existsSync(DIST_INDEX);
  if (hasDist) {
    await fastify.register(fastifyStatic, { root: DIST, prefix: '/', index: ['index.html'] });
  } else {
    fastify.log.warn('web/dist is missing — run `npm run build` first. Only /api, /assets and /stats are served.');
  }

  // A second registration, scoped to its own prefix rather than sharing '/'
  // with the one above — @fastify/static registers a wildcard route per
  // instance, and two wildcard routes at the same prefix is a hard startup
  // crash (duplicate route), not a graceful fallback. The SPA's own bundle
  // lives under web/dist/_app/* instead of the default dist/assets/*,
  // specifically so it never collides with /assets/ here (see
  // vite.config.ts's assetsDir). decorateReply: false — the registration
  // above already decorated `reply.sendFile`.
  await fastify.register(fastifyStatic, { root: join(ROOT, 'assets'), prefix: '/assets/', decorateReply: false });

  await fastify.register(readRoutes);
  await fastify.register(authRoutes);
  await fastify.register(goalsRoutes);
  await fastify.register(refreshRoutes);

  fastify.get('/healthz', async (request, reply) => reply.send({ ok: true }));

  // Client-side routes have no file on disk — hand them index.html so
  // vue-router can take over, same as any SPA host. Anything under an
  // API-shaped or legacy-static prefix falls through to that plugin's own
  // 404 instead, so /api/* keeps answering the {success:false} JSON
  // envelope rather than HTML.
  if (hasDist) {
    fastify.setNotFoundHandler((request, reply) => {
      if (request.method !== 'GET' || NON_SPA_PREFIXES.some((prefix) => request.url.startsWith(prefix))) {
        reply.code(404).send({ success: false, data: null, error: 'Not found.' });
        return;
      }
      reply.type('text/html').sendFile('index.html', DIST);
    });
  }

  return fastify;
}

async function main() {
  const fastify = await buildServer();
  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
  } catch (error) {
    fastify.log.error(error);
    process.exitCode = 1;
  }
}

// Only auto-start when run directly (`node api/server.mjs`) — tests import
// buildServer() and drive it with fastify.inject() instead, same
// dependency-injection convention the rest of the repo already follows
// (buildQuestGoalDrafts' idFactory/nowIso).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
