/**
 * Session creation/lookup/destruction, plus the two Fastify preHandlers
 * every write route is gated behind: `requireSession` (any logged-in
 * account) and `requireOwner` (logged in AND owns the :slug in the route).
 * "Owns" means exactly one thing across this whole API — see the plan:
 * `players.discord_id = session's discord_id`.
 */

import { randomBytes } from 'node:crypto';

import { query } from '../db.mjs';
import { fail } from '../envelope.mjs';

export const SESSION_COOKIE = 'sid';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const sessionCookieOptions = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
};

export function generateSessionId() {
  return randomBytes(32).toString('base64url');
}

/** Upserts the Discord profile into `users`, then opens a fresh session for
 * it. Called once, from the OAuth callback — everywhere else only ever
 * reads a session that already exists. */
export async function loginWithProfile({ discordId, username, avatar }) {
  await query(
    `insert into users (discord_id, username, avatar, last_seen_at) values ($1, $2, $3, now())
     on conflict (discord_id) do update set username = excluded.username, avatar = excluded.avatar, last_seen_at = now()`,
    [discordId, username, avatar],
  );

  const id = generateSessionId();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await query('insert into sessions (id, discord_id, expires_at) values ($1, $2, $3)', [id, discordId, expiresAt]);
  return { id, expiresAt };
}

export async function destroySession(sessionId) {
  await query('delete from sessions where id = $1', [sessionId]);
}

/** The logged-in user for this request's cookie, or null — expired/unknown
 * sessions come back as null rather than throwing, so callers can treat
 * "no session" and "bad session" identically. */
export async function currentUser(sessionId) {
  if (!sessionId) return null;
  const { rows } = await query(
    `select u.discord_id, u.username, u.avatar
     from sessions s
     join users u on u.discord_id = s.discord_id
     where s.id = $1 and s.expires_at > now()`,
    [sessionId],
  );
  return rows[0] ? { discordId: rows[0].discord_id, username: rows[0].username, avatar: rows[0].avatar } : null;
}

/** The roster player this discord_id owns, or null if they haven't claimed
 * one yet. */
export async function ownedPlayer(discordId) {
  if (!discordId) return null;
  const { rows } = await query('select slug, name from players where discord_id = $1', [discordId]);
  return rows[0] ?? null;
}

/**
 * Attaches `request.user` (`{discordId, username, avatar}` or null, always
 * set) so a route can render logged-out state without a second lookup, but
 * ONLY fails the request when `require` is true — used
 * standalone (require: false) by /api/me, and wrapped in requireSession
 * (require: true) by every write route.
 */
function loadUser({ require: mustBeLoggedIn }) {
  return async function preHandler(request, reply) {
    const sessionId = request.cookies[SESSION_COOKIE];
    const user = await currentUser(sessionId);
    request.user = user;
    if (mustBeLoggedIn && !user) {
      reply.clearCookie(SESSION_COOKIE, sessionCookieOptions);
      return fail(reply, 401, 'Sign in with Discord first.');
    }
  };
}

export const attachUser = loadUser({ require: false });
export const requireSession = loadUser({ require: true });

/**
 * Composes with requireSession: once a session is confirmed, checks that
 * its owned player matches `:slug` in the route params. 403s a logged-in
 * user poking at someone else's player, same as a 401 for no session at
 * all — both mean "this route isn't for you," just at different points.
 */
export async function requireOwner(request, reply) {
  const player = await ownedPlayer(request.user.discordId);
  if (!player || player.slug !== request.params.slug) {
    return fail(reply, 403, 'You can only do this for the player you own.');
  }
  request.ownedPlayer = player;
}

/**
 * Composes with requireSession like requireOwner, but for routes that need
 * "any owner" rather than a specific slug's owner — POST /api/refresh (the
 * plan: "any logged-in owner" may trigger a full group refresh). A
 * signed-in visitor who hasn't claimed a roster slug yet is still turned
 * away, same 403 reasoning as requireOwner.
 */
export async function requireAnyOwner(request, reply) {
  const player = await ownedPlayer(request.user.discordId);
  if (!player) {
    return fail(reply, 403, 'Claim a roster player before triggering a refresh.');
  }
  request.ownedPlayer = player;
}
