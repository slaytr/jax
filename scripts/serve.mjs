#!/usr/bin/env node
/**
 * Dependency-free static server for local preview. GitHub Pages serves the same
 * files; this exists only so `npm run serve` works without installing anything.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const PORT = Number(process.env.PORT ?? 4173);

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/** Resolve inside ROOT only — never let a crafted path escape the project. */
function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const relative = normalize(decoded).replace(/^([/\\])+/, '');
  const target = resolve(ROOT, relative);
  return target === ROOT || target.startsWith(ROOT + sep) ? target : null;
}

const server = createServer(async (request, response) => {
  const target = safePath(request.url ?? '/');
  if (!target) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const info = await stat(target);
    const file = info.isDirectory() ? join(target, 'index.html') : target;
    const size = info.isDirectory() ? (await stat(file)).size : info.size;

    response.writeHead(200, {
      'Content-Type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
      'Content-Length': size,
      'Cache-Control': 'no-cache',
    });
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
});

server.listen(PORT, () => console.log(`Serving ${ROOT}\n  → http://localhost:${PORT}`));
