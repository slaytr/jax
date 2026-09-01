/**
 * Who's signed in, and the two actions that change it: `login()` (a real
 * page navigation into the Discord OAuth dance — there's no fetch-based
 * version of that, the browser has to actually go there) and `logout()`.
 * `/auth/*` sits outside the `/api` namespace (see api-client.js), so this
 * is the one module that talks to it directly instead of through
 * apiGet/apiPost.
 */

import { apiGet, apiPost } from './api-client.js';

/** `{user: {discordId, username, avatar} | null, player: {slug, name} | null,
 * unclaimed: {slug, name}[]}` — unclaimed is only ever non-empty for a
 * signed-in user who hasn't claimed a roster slug yet. */
export function getSession() {
  return apiGet('/me');
}

/**
 * A tiny pub-sub so a page's own render loop can react to session changes
 * it didn't initiate itself — specifically, auth-widget.js (mounted
 * independently of any page's own state, see its own doc comment) calling
 * claimPlayer()/logout() from inside its own closure. A page that needs to
 * gate something on ownership (stats.js's create/delete goal buttons)
 * fetches its own initial session (getSession(), above) for the first
 * render, then subscribes here to stay current after that.
 */
const listeners = new Set();

export function subscribeSession(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishSession(session) {
  for (const listener of listeners) listener(session);
}

/** Full-page navigation into the Discord authorize screen — `returnTo` is
 * where the callback should land the browser back on afterwards (defaults
 * to wherever `login()` was called from). The server re-validates it's a
 * same-origin relative path before ever redirecting there (see
 * api/routes/auth.mjs's safeReturnTo), so this is just a hint. */
export function login(returnTo = window.location.pathname + window.location.search) {
  const url = new URL('/auth/discord', window.location.origin);
  url.searchParams.set('returnTo', returnTo);
  window.location.href = url.toString();
}

export async function logout() {
  const response = await fetch('/auth/logout', { method: 'POST' });
  if (!response.ok) throw new Error(`Logout responded ${response.status}.`);
}

/** Claims a roster slug for the signed-in account — 409s (already claimed,
 * or this account already owns a different slug) reach the caller as a
 * rejected promise via api-client.js's envelope handling. */
export function claimPlayer(slug) {
  return apiPost('/me/claim', { slug });
}
