/**
 * The on-demand refresh control — "Refresh now" on the group page (POST
 * /api/refresh, any signed-in owner) or "Refresh me" on a player's own
 * stats page (POST /api/players/:slug/refresh, that slug's owner only).
 * Mounted into its own DOM slot and self-contained, same reasoning as
 * views/auth-widget.js: refresh has nothing to do with app.js's/stats.js's
 * own render() state, and a stray click shouldn't have to thread a loading
 * flag through either of those large closures.
 *
 * On a successful run this reloads the page — app.js/stats.js's boot()
 * closures hold a lot of derived state that was never designed to be
 * recomputed mid-session, and a full reload is a simple, honest way to
 * show the numbers a refresh just fetched.
 */

import { el, replaceChildren } from '../dom.js';
import { apiGet, apiPost } from '../api-client.js';
import { getSession, subscribeSession } from '../session.js';

const POLL_INTERVAL_MS = 1000;
const MAX_POLLS = 30; // ~30s — a full group cycle is a handful of sequential fetches with rate-limit sleeps baked in, see scripts/hiscores.mjs/quests.mjs

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param container element to render into
 * @param scope 'group' | 'player'
 * @param slug required when scope is 'player' — whose refresh button this is
 */
export function mountRefreshButton(container, { scope, slug = null }) {
  let session = { user: null, player: null, unclaimed: [] };
  let status = 'idle'; // idle | running | error
  let errorMessage = null;

  const canTrigger = () => (scope === 'player' ? session.player?.slug === slug : Boolean(session.player));

  function render() {
    if (!canTrigger()) {
      replaceChildren(container);
      return;
    }

    const label = status === 'running' ? 'Refreshing…' : status === 'error' ? 'Retry refresh' : 'Refresh now';
    replaceChildren(
      container,
      el(
        'button',
        {
          class: 'refresh-button',
          type: 'button',
          disabled: status === 'running',
          title: errorMessage ?? undefined,
          onClick: handleClick,
        },
        label,
      ),
      status === 'error' && errorMessage ? el('span', { class: 'refresh-error', text: errorMessage }) : null,
    );
  }

  async function pollUntilDone(runId) {
    for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
      const run = await apiGet(`/refresh/${runId}`);
      if (run.status === 'ok') return;
      if (run.status === 'failed') throw new Error(run.error ?? 'The refresh failed.');
      await sleep(POLL_INTERVAL_MS);
    }
    throw new Error('Still running after 30s — check back shortly.');
  }

  async function handleClick() {
    status = 'running';
    errorMessage = null;
    render();

    try {
      const path = scope === 'player' ? `/players/${slug}/refresh` : '/refresh';
      const { runId } = await apiPost(path);
      await pollUntilDone(runId);
      window.location.reload();
    } catch (error) {
      status = 'error';
      errorMessage = error.message;
      render();
    }
  }

  subscribeSession((nextSession) => {
    session = nextSession;
    render();
  });

  getSession()
    .then((initial) => {
      session = initial;
      render();
    })
    .catch(() => {
      // No session yet — canTrigger() already defaults to false, so this
      // just means the button stays absent rather than erroring visibly;
      // the auth widget (mounted separately) is what surfaces sign-in
      // problems.
    });

  render();
}
