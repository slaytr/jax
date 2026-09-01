#!/usr/bin/env node
/**
 * The one Railway web service: serves the static site (index.html, assets/,
 * stats/, and — until the phase 6 cutover deletes them — data/ and
 * quest-data/quests.json) and everything under /api/* and /auth/*, all from
 * the same origin. That's the whole reason this replaces GitHub Pages: a
 * session cookie can be HttpOnly + SameSite=Lax with no CORS involved only
 * if the site and the API answer the same origin.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCookie from '@fastify/cookie';

import readRoutes from './routes/read.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT ?? 4173);

// Explicit allowlist rather than serving the whole repo: this directory
// also holds api/, scripts/, test/, node_modules/, .git — none of which is
// meant to be fetchable. Extend this list, don't widen it, as new public
// assets show up (it shrinks again once phase 6 removes data/ and
// quest-data/).
const PUBLIC_PREFIXES = ['/assets/', '/stats/', '/data/', '/quest-data/'];
const PUBLIC_FILES = new Set(['/', '/index.html', '/.nojekyll']);

function isPublicPath(urlPath) {
  if (PUBLIC_FILES.has(urlPath)) return true;
  return PUBLIC_PREFIXES.some((prefix) => urlPath.startsWith(prefix));
}

export async function buildServer() {
  const fastify = Fastify({ logger: process.env.NODE_ENV !== 'test' });

  await fastify.register(fastifyCookie, { secret: process.env.SESSION_SECRET });

  await fastify.register(fastifyStatic, {
    root: ROOT,
    prefix: '/',
    index: ['index.html'],
    allowedPath: (pathName) => isPublicPath(pathName),
  });

  await fastify.register(readRoutes);

  fastify.get('/healthz', async (request, reply) => reply.send({ ok: true }));

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
