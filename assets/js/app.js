/**
 * Application shell: loads the committed snapshot and renders one page.
 *
 * Everything is on a single view — standings, day gains, the skill matrix and
 * the competitive ladder — so nothing worth comparing is hidden behind a tab.
 * State is replaced rather than mutated, so each render is a pure function of
 * one immutable state object.
 */

import { loadGroupData } from './data.js';
import { computeGains, computeLevelGains, computeRankDelta, groupSummary, groupTrend } from './compute.js';
import { el, replaceChildren } from './dom.js';
import { renderMasthead } from './views/masthead.js';
import { renderLeaderboards } from './views/leaderboards.js';
import { renderMatrix } from './views/matrix.js';

const ONE_DAY = 86400;
const ONE_WEEK = 7 * ONE_DAY;
const ONE_MONTH = 30 * ONE_DAY;

const dom = {
  masthead: document.getElementById('masthead'),
  panel: document.getElementById('panel'),
  footer: document.getElementById('footer-meta'),
};

let state = null;

const setState = (patch) => {
  state = { ...state, ...patch };
  render();
};

function render() {
  const summary = groupSummary(state.players);
  const levelGains = computeLevelGains(state.snapshots, state.players, ONE_DAY);

  const windows = {
    day: computeGains(state.snapshots, state.players, ONE_DAY),
    week: computeGains(state.snapshots, state.players, ONE_WEEK),
    month: computeGains(state.snapshots, state.players, ONE_MONTH),
  };

  renderMasthead(dom.masthead, {
    ...state,
    summary,
    trend: groupTrend(state.snapshots),
    rankDelta: computeRankDelta(state.snapshots),
    staleCount: state.players.filter((player) => player.stale).length,
  });

  replaceChildren(
    dom.panel,
    ...renderLeaderboards(state, windows),
    renderMatrix(state, levelGains, (slug) => setState({ sortedBy: slug })),
  );
}

function renderFatal(message) {
  replaceChildren(
    dom.panel,
    el('div', { class: 'empty empty-error' }, [
      el('p', { class: 'empty-title', text: 'Could not load hiscore data' }),
      el('p', { class: 'empty-body', text: message }),
      el('p', {
        class: 'empty-body',
        text: 'data/latest.json is produced by the scheduled GitHub Action. If this is a fresh deployment, run the "Update hiscores" workflow once.',
      }),
    ]),
  );
}

async function boot() {
  try {
    const data = await loadGroupData();
    // sortedBy: player slug the matrix is ordered around, or null for skill order.
    state = { ...data, sortedBy: null };

    document.title = `${data.group.name} · Group Ironman hiscores`;
    replaceChildren(
      dom.footer,
      el('span', {
        text: `Data from the RuneScape 3 hiscores, refreshed by GitHub Actions. Last fetch ${new Date(data.fetchedAt).toUTCString()}.`,
      }),
    );

    render();
  } catch (error) {
    console.error(error);
    renderFatal(error.message);
  } finally {
    document.body.dataset.ready = 'true';
  }
}

boot();
