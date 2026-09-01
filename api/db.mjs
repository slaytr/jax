/**
 * The one Postgres connection pool for the whole API, plus a couple of thin
 * helpers everything else builds on. Every other module in api/ imports
 * `query`/`withTransaction` from here rather than touching `pg` directly, so
 * connection setup (SSL, pool size) lives in exactly one place.
 */

import pg from 'pg';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL env var is required.');
}

// Railway's managed Postgres terminates TLS with a certificate that Node's
// default trust store doesn't chain to; rejectUnauthorized: false is the
// standard escape hatch for that setup (same as Heroku/Render Postgres).
// Local dev (DATABASE_URL pointing at localhost) doesn't need TLS at all —
// `sslmode` in the connection string, if present, takes precedence.
const ssl = connectionString.includes('sslmode=disable') ? false : { rejectUnauthorized: false };

export const pool = new Pool({ connectionString, ssl });

/** Runs one query against the shared pool. `client` lets a caller inside a
 * transaction reuse its own connection instead of borrowing a second one
 * from the pool (which would deadlock a pool of size 1). */
export function query(text, params, client = pool) {
  return client.query(text, params);
}

/**
 * Runs `fn(client)` inside a BEGIN/COMMIT, rolling back on any throw. `fn`
 * receives the checked-out client so it can pass it through to `query()`
 * for every statement in the transaction — never mix pool.query and a
 * transaction client for the same logical unit of work.
 */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => {
      // Rollback itself failing means the connection is already dead —
      // nothing more we can do with it, and the original error is what
      // the caller needs to see.
    });
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool() {
  await pool.end();
}
