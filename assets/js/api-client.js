/**
 * The one place that knows the API's response envelope
 * (`{success, data, error}` — see ~/.claude/rules/typescript/patterns.md)
 * and how to unwrap it. Every module that talks to /api/* — session.js,
 * goals-storage.js, goal-labels-storage.js, and the refresh button — calls
 * through here instead of hand-rolling fetch + JSON parsing + error
 * messages each time.
 *
 * Cookies ride along automatically: same-origin requests send them without
 * any `credentials` option (only a cross-origin request would need
 * `credentials: 'include'`, and the site and API share an origin — see the
 * plan's Hosting decision).
 */

import { API_BASE } from './config.js';

async function request(method, path, body) {
  const url = `${API_BASE}${path}`;
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (cause) {
    throw new Error(`Could not reach ${url} (${cause.message}).`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`${url} responded ${response.status} with no valid JSON.`);
  }

  if (!response.ok || !payload.success) {
    const error = new Error(payload.error ?? `${url} responded ${response.status}.`);
    error.status = response.status;
    throw error;
  }

  return payload.data;
}

export const apiGet = (path) => request('GET', path);
export const apiPost = (path, body) => request('POST', path, body ?? {});
export const apiPatch = (path, body) => request('PATCH', path, body ?? {});
export const apiPut = (path, body) => request('PUT', path, body ?? {});
export const apiDelete = (path) => request('DELETE', path);
