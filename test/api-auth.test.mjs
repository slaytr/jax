/**
 * Session mechanics and the claim flow, exercised against a real Postgres
 * via fastify.inject() — no Discord credentials needed anywhere here:
 * loginWithProfile() is the same function the OAuth callback calls after
 * Discord hands back a profile, so seeding a session directly with it tests
 * everything downstream of that exchange without faking HTTP calls to
 * Discord itself. Skipped (not failed) when DATABASE_URL isn't set, so
 * `npm test` stays green with no database around.
 */

import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';

const hasDb = Boolean(process.env.DATABASE_URL);

describe('auth + sessions API', { skip: hasDb ? false : 'DATABASE_URL not set' }, () => {
  let fastify;
  let query;
  let closePool;
  let loginWithProfile;

  const TEST_SLUG = 'test-claim-player';
  const TEST_DISCORD_ID = 'test-discord-999';
  const OTHER_DISCORD_ID = 'test-discord-other';

  before(async () => {
    const serverModule = await import('../api/server.mjs');
    ({ query, closePool } = await import('../api/db.mjs'));
    ({ loginWithProfile } = await import('../api/auth/session.mjs'));

    fastify = await serverModule.buildServer();
    await query(
      `insert into players (slug, name, hiscore_table, position) values ($1, $2, 'main', 999)
       on conflict (slug) do update set discord_id = null`,
      [TEST_SLUG, 'Test Claim Player'],
    );
  });

  after(async () => {
    // Exact IDs, not a LIKE prefix: node --test runs every file in this
    // directory concurrently against the same real Postgres, and a broad
    // 'test-discord-%' here would also delete sessions another test file
    // (api-goals.test.mjs) is still using mid-run.
    await query('delete from sessions where discord_id in ($1, $2)', [TEST_DISCORD_ID, OTHER_DISCORD_ID]);
    await query('delete from users where discord_id in ($1, $2)', [TEST_DISCORD_ID, OTHER_DISCORD_ID]);
    await query('delete from players where slug = $1', [TEST_SLUG]);
    await fastify.close();
    await closePool();
  });

  it('GET /api/me with no cookie is the logged-out shape, not an error', async () => {
    const response = await fastify.inject({ method: 'GET', url: '/api/me' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json().data, { user: null, player: null, unclaimed: [] });
  });

  it('POST /api/me/claim with no session is 401', async () => {
    const response = await fastify.inject({ method: 'POST', url: '/api/me/claim', payload: { slug: TEST_SLUG } });
    assert.equal(response.statusCode, 401);
    assert.equal(response.json().success, false);
  });

  it('a logged-in user with no player yet sees the unclaimed roster', async () => {
    await query('update players set discord_id = null where slug = $1', [TEST_SLUG]);
    const session = await loginWithProfile({ discordId: TEST_DISCORD_ID, username: 'Tester', avatar: null });

    const response = await fastify.inject({ method: 'GET', url: '/api/me', cookies: { sid: session.id } });
    const { data } = response.json();
    assert.equal(data.user.discordId, TEST_DISCORD_ID);
    assert.equal(data.player, null);
    assert.ok(data.unclaimed.some((player) => player.slug === TEST_SLUG));
  });

  it('claiming an unclaimed slug succeeds and /api/me reflects it', async () => {
    await query('update players set discord_id = null where slug = $1', [TEST_SLUG]);
    const session = await loginWithProfile({ discordId: TEST_DISCORD_ID, username: 'Tester', avatar: null });

    const claim = await fastify.inject({ method: 'POST', url: '/api/me/claim', cookies: { sid: session.id }, payload: { slug: TEST_SLUG } });
    assert.equal(claim.statusCode, 200);
    assert.equal(claim.json().data.player.slug, TEST_SLUG);

    const me = await fastify.inject({ method: 'GET', url: '/api/me', cookies: { sid: session.id } });
    assert.equal(me.json().data.player.slug, TEST_SLUG);
  });

  it('claiming a second slug while already owning one is 409, and the second slug stays unclaimed', async () => {
    await query('update players set discord_id = $1 where slug = $2', [TEST_DISCORD_ID, TEST_SLUG]);
    const session = await loginWithProfile({ discordId: TEST_DISCORD_ID, username: 'Tester', avatar: null });

    const response = await fastify.inject({ method: 'POST', url: '/api/me/claim', cookies: { sid: session.id }, payload: { slug: 'jelly-tax' } });
    assert.equal(response.statusCode, 409);

    const { rows } = await query('select discord_id from players where slug = $1', ['jelly-tax']);
    assert.equal(rows[0].discord_id, null);
  });

  it('a different account cannot claim an already-claimed slug', async () => {
    await query('update players set discord_id = $1 where slug = $2', [TEST_DISCORD_ID, TEST_SLUG]);
    const session = await loginWithProfile({ discordId: OTHER_DISCORD_ID, username: 'Other', avatar: null });

    const response = await fastify.inject({ method: 'POST', url: '/api/me/claim', cookies: { sid: session.id }, payload: { slug: TEST_SLUG } });
    assert.equal(response.statusCode, 409);

    const { rows } = await query('select discord_id from players where slug = $1', [TEST_SLUG]);
    assert.equal(rows[0].discord_id, TEST_DISCORD_ID);
  });

  it('a missing/garbage session cookie behaves exactly like no cookie', async () => {
    const response = await fastify.inject({ method: 'GET', url: '/api/me', cookies: { sid: 'not-a-real-session' } });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().data.user, null);
  });

  it('logging out clears the session so /api/me goes back to logged-out', async () => {
    await query('update players set discord_id = $1 where slug = $2', [TEST_DISCORD_ID, TEST_SLUG]);
    const session = await loginWithProfile({ discordId: TEST_DISCORD_ID, username: 'Tester', avatar: null });

    const logout = await fastify.inject({ method: 'POST', url: '/auth/logout', cookies: { sid: session.id } });
    assert.equal(logout.statusCode, 200);

    const me = await fastify.inject({ method: 'GET', url: '/api/me', cookies: { sid: session.id } });
    assert.equal(me.json().data.user, null);
  });
});
