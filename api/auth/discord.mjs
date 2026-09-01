/**
 * The Discord OAuth2 dance, isolated in its own module so
 * routes/auth.mjs stays about HTTP/cookie plumbing rather than knowing
 * Discord's endpoint shapes. Every function that talks to Discord takes an
 * injectable `fetchImpl` (defaulting to the global `fetch`) — same
 * dependency-injection convention as buildQuestGoalDrafts' idFactory/nowIso —
 * so routes/auth.mjs's own tests can stub Discord out entirely without a
 * real client id/secret.
 */

const AUTHORIZE_URL = 'https://discord.com/api/oauth2/authorize';
const TOKEN_URL = 'https://discord.com/api/oauth2/token';
const USER_URL = 'https://discord.com/api/users/@me';

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} env var is required.`);
  return value;
}

/** Where /auth/discord redirects the browser. `state` is a random nonce the
 * caller has already stashed in a short-lived cookie, to be checked back
 * against the callback's own `state` query param. */
export function authorizeUrl(state) {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('client_id', requiredEnv('DISCORD_CLIENT_ID'));
  url.searchParams.set('redirect_uri', requiredEnv('DISCORD_REDIRECT_URI'));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'identify');
  url.searchParams.set('state', state);
  return url.toString();
}

/** Exchanges the callback's one-time `code` for an access token. Throws with
 * a descriptive message on any non-2xx — the caller turns that into a
 * redirect-back-to-login-with-an-error rather than a raw 500. */
export async function exchangeCode(code, fetchImpl = fetch) {
  const body = new URLSearchParams({
    client_id: requiredEnv('DISCORD_CLIENT_ID'),
    client_secret: requiredEnv('DISCORD_CLIENT_SECRET'),
    grant_type: 'authorization_code',
    code,
    redirect_uri: requiredEnv('DISCORD_REDIRECT_URI'),
  });

  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) {
    throw new Error(`Discord token exchange failed (${response.status}).`);
  }
  const payload = await response.json();
  return payload.access_token;
}

/** The bits of a Discord user we actually keep — id, display name, avatar
 * hash (already an https URL, not the raw hash, since that's all the
 * front end ever needs to render it). */
export async function fetchProfile(accessToken, fetchImpl = fetch) {
  const response = await fetchImpl(USER_URL, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!response.ok) {
    throw new Error(`Discord profile fetch failed (${response.status}).`);
  }
  const user = await response.json();
  return {
    discordId: user.id,
    username: user.global_name ?? user.username,
    avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : null,
  };
}
