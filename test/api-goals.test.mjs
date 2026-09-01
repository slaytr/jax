/**
 * Goals + goal labels, exercised the same way as api-auth.test.mjs —
 * fastify.inject() against a real Postgres, sessions seeded directly with
 * loginWithProfile() so nothing here touches Discord. Skipped when
 * DATABASE_URL isn't set.
 */

import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';

const hasDb = Boolean(process.env.DATABASE_URL);

describe('goals API', { skip: hasDb ? false : 'DATABASE_URL not set' }, () => {
  let fastify;
  let query;
  let closePool;
  let loginWithProfile;

  const TEST_SLUG = 'test-goals-player';
  const OWNER_DISCORD_ID = 'test-discord-goals-owner';
  const OTHER_DISCORD_ID = 'test-discord-goals-other';
  let ownerCookie;
  let otherCookie;

  const skillDraft = (overrides = {}) => ({
    id: crypto.randomUUID(),
    kind: 'skill',
    skillId: 1,
    targetType: 'level',
    targetValue: 75,
    group: null,
    labels: [],
    startLevel: 60,
    startXp: 300000,
    startedAt: new Date().toISOString(),
    completedAt: null,
    ...overrides,
  });

  const questDraft = (overrides = {}) => ({
    id: crypto.randomUUID(),
    kind: 'quest',
    questName: 'Dragon Slayer',
    group: 'Dragon Slayer',
    labels: [],
    startedAt: new Date().toISOString(),
    completedAt: null,
    ...overrides,
  });

  before(async () => {
    const serverModule = await import('../api/server.mjs');
    ({ query, closePool } = await import('../api/db.mjs'));
    ({ loginWithProfile } = await import('../api/auth/session.mjs'));

    fastify = await serverModule.buildServer();

    await query(
      `insert into players (slug, name, hiscore_table, position, discord_id) values ($1, $2, 'main', 998, $3)
       on conflict (slug) do update set discord_id = excluded.discord_id`,
      [TEST_SLUG, 'Test Goals Player', OWNER_DISCORD_ID],
    );

    const ownerSession = await loginWithProfile({ discordId: OWNER_DISCORD_ID, username: 'Owner', avatar: null });
    const otherSession = await loginWithProfile({ discordId: OTHER_DISCORD_ID, username: 'Other', avatar: null });
    ownerCookie = { sid: ownerSession.id };
    otherCookie = { sid: otherSession.id };
  });

  after(async () => {
    await query('delete from goals where player_slug = $1', [TEST_SLUG]);
    await query('delete from goal_labels where player_slug = $1', [TEST_SLUG]);
    await query('delete from sessions where discord_id in ($1, $2)', [OWNER_DISCORD_ID, OTHER_DISCORD_ID]);
    await query('delete from users where discord_id in ($1, $2)', [OWNER_DISCORD_ID, OTHER_DISCORD_ID]);
    await query('delete from players where slug = $1', [TEST_SLUG]);
    await fastify.close();
    await closePool();
  });

  it('GET with no goals yet returns empty arrays, not an error', async () => {
    const response = await fastify.inject({ method: 'GET', url: `/api/players/${TEST_SLUG}/goals` });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json().data, { goals: [], labels: [] });
  });

  it('POST with no session is 401', async () => {
    const response = await fastify.inject({ method: 'POST', url: `/api/players/${TEST_SLUG}/goals`, payload: { goals: [skillDraft()] } });
    assert.equal(response.statusCode, 401);
  });

  it('POST from a session that does not own this slug is 403', async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: `/api/players/${TEST_SLUG}/goals`,
      cookies: otherCookie,
      payload: { goals: [skillDraft()] },
    });
    assert.equal(response.statusCode, 403);
  });

  it('the owner can create a skill goal, and GET reflects it in the exact client shape', async () => {
    const draft = skillDraft();
    const create = await fastify.inject({ method: 'POST', url: `/api/players/${TEST_SLUG}/goals`, cookies: ownerCookie, payload: { goals: [draft] } });
    assert.equal(create.statusCode, 201);
    const [created] = create.json().data.goals;
    assert.equal(created.id, draft.id);
    assert.equal(created.skillId, 1);
    assert.equal('questName' in created, false);

    const list = await fastify.inject({ method: 'GET', url: `/api/players/${TEST_SLUG}/goals` });
    assert.ok(list.json().data.goals.some((goal) => goal.id === draft.id));
  });

  it('rejects a malformed goal with 400, not a 500', async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: `/api/players/${TEST_SLUG}/goals`,
      cookies: ownerCookie,
      payload: { goals: [skillDraft({ skillId: 999 })] },
    });
    assert.equal(response.statusCode, 400);
  });

  it('a quest goal plus its skill-requirement siblings are inserted atomically as one batch', async () => {
    const group = 'Batch Quest';
    const drafts = [questDraft({ questName: group, group }), skillDraft({ group }), skillDraft({ group, skillId: 2 })];

    const create = await fastify.inject({ method: 'POST', url: `/api/players/${TEST_SLUG}/goals`, cookies: ownerCookie, payload: { goals: drafts } });
    assert.equal(create.statusCode, 201);
    assert.equal(create.json().data.goals.length, 3);

    const { rows } = await query('select id from goals where player_slug = $1 and goal_group = $2', [TEST_SLUG, group]);
    assert.equal(rows.length, 3);
  });

  it('one invalid goal in a batch rejects the whole batch — nothing partial gets persisted', async () => {
    const group = 'Rejected Batch';
    const drafts = [skillDraft({ group }), skillDraft({ group, skillId: -1 })]; // second one is invalid

    const create = await fastify.inject({ method: 'POST', url: `/api/players/${TEST_SLUG}/goals`, cookies: ownerCookie, payload: { goals: drafts } });
    assert.equal(create.statusCode, 400);

    const { rows } = await query('select id from goals where player_slug = $1 and goal_group = $2', [TEST_SLUG, group]);
    assert.equal(rows.length, 0, 'the valid goal in the rejected batch must not have been inserted either');
  });

  it('PATCH lets the owner stamp completion, and a non-owner gets 403', async () => {
    const draft = skillDraft();
    await fastify.inject({ method: 'POST', url: `/api/players/${TEST_SLUG}/goals`, cookies: ownerCookie, payload: { goals: [draft] } });

    const forbidden = await fastify.inject({
      method: 'PATCH',
      url: `/api/players/${TEST_SLUG}/goals/${draft.id}`,
      cookies: otherCookie,
      payload: { completedAt: new Date().toISOString() },
    });
    assert.equal(forbidden.statusCode, 403);

    const completedAt = new Date().toISOString();
    const patch = await fastify.inject({
      method: 'PATCH',
      url: `/api/players/${TEST_SLUG}/goals/${draft.id}`,
      cookies: ownerCookie,
      payload: { completedAt, completedLevel: 75, completedXp: 1_200_000 },
    });
    assert.equal(patch.statusCode, 200);
    assert.equal(patch.json().data.goal.completedAt, completedAt);
    assert.equal(patch.json().data.goal.completedLevel, 75);
  });

  it('DELETE soft-deletes: the goal disappears from GET but the row survives with deleted_at set', async () => {
    const draft = skillDraft();
    await fastify.inject({ method: 'POST', url: `/api/players/${TEST_SLUG}/goals`, cookies: ownerCookie, payload: { goals: [draft] } });

    const del = await fastify.inject({ method: 'DELETE', url: `/api/players/${TEST_SLUG}/goals/${draft.id}`, cookies: ownerCookie });
    assert.equal(del.statusCode, 200);

    const list = await fastify.inject({ method: 'GET', url: `/api/players/${TEST_SLUG}/goals` });
    assert.ok(!list.json().data.goals.some((goal) => goal.id === draft.id));

    const { rows } = await query('select deleted_at from goals where id = $1', [draft.id]);
    assert.ok(rows[0].deleted_at !== null);
  });

  it('deleting someone else\'s goal is 403 and leaves it in place', async () => {
    const draft = skillDraft();
    await fastify.inject({ method: 'POST', url: `/api/players/${TEST_SLUG}/goals`, cookies: ownerCookie, payload: { goals: [draft] } });

    const response = await fastify.inject({ method: 'DELETE', url: `/api/players/${TEST_SLUG}/goals/${draft.id}`, cookies: otherCookie });
    assert.equal(response.statusCode, 403);

    const { rows } = await query('select deleted_at from goals where id = $1', [draft.id]);
    assert.equal(rows[0].deleted_at, null);
  });

  it('goal labels: owner can create/update/delete, non-owner is 403', async () => {
    const forbidden = await fastify.inject({ method: 'PUT', url: `/api/players/${TEST_SLUG}/goal-labels/combat`, cookies: otherCookie, payload: { colour: '#cc3346' } });
    assert.equal(forbidden.statusCode, 403);

    const put = await fastify.inject({ method: 'PUT', url: `/api/players/${TEST_SLUG}/goal-labels/combat`, cookies: ownerCookie, payload: { colour: '#cc3346' } });
    assert.equal(put.statusCode, 200);

    const list = await fastify.inject({ method: 'GET', url: `/api/players/${TEST_SLUG}/goals` });
    assert.deepEqual(list.json().data.labels, [{ name: 'combat', colour: '#cc3346' }]);

    const del = await fastify.inject({ method: 'DELETE', url: `/api/players/${TEST_SLUG}/goal-labels/combat`, cookies: ownerCookie });
    assert.equal(del.statusCode, 200);

    const listAfter = await fastify.inject({ method: 'GET', url: `/api/players/${TEST_SLUG}/goals` });
    assert.deepEqual(listAfter.json().data.labels, []);
  });
});
