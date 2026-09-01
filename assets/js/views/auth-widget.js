/**
 * The Discord sign-in / claim-your-player / sign-out control. Lives in its
 * own DOM node (#auth-widget, a sibling of #masthead) and owns its own
 * render loop entirely independent of app.js's/stats.js's own state and
 * render() cycle — it has nothing to do with hiscore data, and mounting it
 * separately means a session hiccup can never block the page's main content
 * from rendering (see boot() in each caller: this is fired off unawaited).
 */

import { el, replaceChildren } from '../dom.js';
import { getSession, login, logout, claimPlayer, publishSession } from '../session.js';

/**
 * @param container element to render into (e.g. #auth-widget)
 *
 * Every successful session fetch — the initial one included — is
 * broadcast via session.js's publishSession, so any page that needs to
 * gate something on ownership (stats.js's create/delete goal buttons) can
 * subscribeSession() instead of this function taking a bespoke callback.
 */
export function mountAuthWidget(container) {
  let session = { user: null, player: null, unclaimed: [] };
  let claiming = false;
  let error = null;

  async function refresh() {
    try {
      session = await getSession();
      error = null;
      publishSession(session);
    } catch (cause) {
      error = cause.message;
    }
    render();
  }

  function render() {
    replaceChildren(container, content());
  }

  function content() {
    if (error) {
      return el('div', { class: 'auth-widget auth-widget-error', role: 'alert' }, [
        el('span', { text: 'Sign-in unavailable right now.' }),
      ]);
    }
    if (!session.user) {
      return el('div', { class: 'auth-widget' }, [
        el('button', { class: 'auth-button', type: 'button', onClick: () => login() }, 'Sign in with Discord'),
      ]);
    }
    if (!session.player) {
      return el('div', { class: 'auth-widget' }, [
        el('span', { class: 'auth-widget-name', text: session.user.username }),
        claimPicker(),
      ]);
    }
    return el('div', { class: 'auth-widget' }, [
      el('span', { class: 'auth-widget-name', text: `${session.user.username} · playing as ${session.player.name}` }),
      el('button', { class: 'auth-button auth-button-ghost', type: 'button', onClick: handleLogout }, 'Sign out'),
    ]);
  }

  function claimPicker() {
    if (session.unclaimed.length === 0) {
      return el('span', { class: 'auth-widget-hint', text: 'Every player has been claimed.' });
    }

    const select = el(
      'select',
      { class: 'auth-select', 'aria-label': 'Which player is you?', disabled: claiming },
      session.unclaimed.map((player) => el('option', { value: player.slug, text: player.name })),
    );
    const button = el(
      'button',
      { class: 'auth-button', type: 'button', disabled: claiming, onClick: () => handleClaim(select.value) },
      claiming ? 'Claiming…' : 'This is me',
    );
    return el('span', { class: 'auth-widget-claim' }, [select, button]);
  }

  async function handleClaim(slug) {
    if (!slug || claiming) return;
    claiming = true;
    render();
    try {
      await claimPlayer(slug);
      claiming = false;
      await refresh();
    } catch (cause) {
      claiming = false;
      error = cause.message;
      render();
    }
  }

  async function handleLogout() {
    try {
      await logout();
    } catch (cause) {
      error = cause.message;
      render();
      return;
    }
    await refresh();
  }

  refresh();

  // Exposed for a caller that wants to force a re-check (e.g. after
  // returning from the Discord redirect on the very page it started from).
  return { refresh };
}
