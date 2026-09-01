/**
 * The Discord login flow (/auth/*) and the two routes the front end polls
 * to know who's signed in and let them claim a roster slug (/api/me,
 * /api/me/claim). Everything that actually decides "is this session valid"
 * lives in api/auth/session.mjs — this file is just the HTTP wiring.
 */

import { randomBytes } from 'node:crypto';

import { query } from '../db.mjs';
import { ok, fail } from '../envelope.mjs';
import { authorizeUrl, exchangeCode, fetchProfile } from '../auth/discord.mjs';
import { SESSION_COOKIE, sessionCookieOptions, loginWithProfile, destroySession, attachUser, requireSession, ownedPlayer } from '../auth/session.mjs';

const STATE_COOKIE = 'oauth_state';
const RETURN_TO_COOKIE = 'oauth_return_to';
const SHORT_LIVED_COOKIE_OPTIONS = { path: '/auth', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 300 };

const randomToken = () => randomBytes(16).toString('base64url');

/** Only ever a same-origin relative path — session.js sends back
 * `location.pathname + location.search`, but this is a value an attacker
 * controls in the request too, so anything that isn't unambiguously
 * relative (starts with something other than a single `/`) is rejected in
 * favour of the home page rather than trusted as a redirect target. */
function safeReturnTo(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

async function handleAuthorize(request, reply) {
  const state = randomToken();
  reply.setCookie(STATE_COOKIE, state, SHORT_LIVED_COOKIE_OPTIONS);
  reply.setCookie(RETURN_TO_COOKIE, safeReturnTo(request.query?.returnTo), SHORT_LIVED_COOKIE_OPTIONS);
  reply.redirect(authorizeUrl(state));
}

async function handleCallback(request, reply) {
  const { code, state } = request.query ?? {};
  const expectedState = request.cookies[STATE_COOKIE];
  const returnTo = safeReturnTo(request.cookies[RETURN_TO_COOKIE]);
  reply.clearCookie(STATE_COOKIE, { path: '/auth' });
  reply.clearCookie(RETURN_TO_COOKIE, { path: '/auth' });

  // Missing/mismatched state means this callback wasn't the browser's own
  // round trip from handleAuthorize above (a replayed link, a forged
  // request) — bail out to the home page rather than trusting `code`.
  if (!code || !state || !expectedState || state !== expectedState) {
    return reply.redirect('/?auth=failed');
  }

  try {
    const accessToken = await exchangeCode(code);
    const profile = await fetchProfile(accessToken);
    const session = await loginWithProfile(profile);
    reply.setCookie(SESSION_COOKIE, session.id, { ...sessionCookieOptions, expires: session.expiresAt });
    return reply.redirect(returnTo);
  } catch (error) {
    request.log.error(error, 'Discord login failed');
    return reply.redirect('/?auth=failed');
  }
}

async function handleLogout(request, reply) {
  const sessionId = request.cookies[SESSION_COOKIE];
  if (sessionId) await destroySession(sessionId);
  reply.clearCookie(SESSION_COOKIE, sessionCookieOptions);
  return ok(reply, { loggedOut: true });
}

async function handleMe(request, reply) {
  if (!request.user) return ok(reply, { user: null, player: null, unclaimed: [] });

  const player = await ownedPlayer(request.user.discordId);
  let unclaimed = [];
  if (!player) {
    const { rows } = await query('select slug, name from players where discord_id is null order by position');
    unclaimed = rows;
  }

  return ok(reply, { user: request.user, player, unclaimed });
}

async function handleClaim(request, reply) {
  const { slug } = request.body;
  const discordId = request.user.discordId;

  const existing = await ownedPlayer(discordId);
  if (existing) return fail(reply, 409, `You already own ${existing.name} (${existing.slug}) — one player per account.`);

  // Conditional UPDATE, not a SELECT-then-UPDATE: this is the one place two
  // browsers could race to claim the same slug, and the WHERE clause makes
  // Postgres itself the tiebreaker rather than a check-then-act gap here.
  const { rowCount } = await query('update players set discord_id = $1 where slug = $2 and discord_id is null', [discordId, slug]);

  if (rowCount === 0) {
    const { rows } = await query('select discord_id from players where slug = $1', [slug]);
    if (!rows[0]) return fail(reply, 404, `No roster player "${slug}".`);
    return fail(reply, 409, 'That player has already been claimed.');
  }

  const player = await ownedPlayer(discordId);
  return ok(reply, { player });
}

export default async function authRoutes(fastify) {
  fastify.get('/auth/discord', handleAuthorize);
  fastify.get('/auth/discord/callback', handleCallback);
  fastify.post('/auth/logout', handleLogout);

  fastify.get('/api/me', { preHandler: attachUser }, handleMe);

  fastify.post(
    '/api/me/claim',
    {
      preHandler: requireSession,
      schema: { body: { type: 'object', required: ['slug'], properties: { slug: { type: 'string', minLength: 1 } } } },
    },
    handleClaim,
  );
}
