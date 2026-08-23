/**
 * Application shell: loads the committed snapshot and renders one page.
 *
 * Everything is on a single view — standings, day gains, the skill matrix and
 * the competitive ladder — so nothing worth comparing is hidden behind a tab.
 * State is replaced rather than mutated, so each render is a pure function of
 * one immutable state object.
 */

import { loadGroupData } from './data.js';
import {
  computeGains,
  computeLevelGains,
  computeQuestGains,
  computeRankDelta,
  groupSummary,
  groupTrend,
  nextScheduledRun,
} from './compute.js';
import { el, replaceChildren } from './dom.js';
import { renderMasthead } from './views/masthead.js';
import { renderGains } from './views/leaderboards.js';
import { renderStandings } from './views/standings.js';
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

/**
 * The masthead alone, so the "last updated" age and "next update in" countdown
 * can tick without rebuilding the matrix underneath the reader's cursor.
 */
function paintMasthead() {
  renderMasthead(dom.masthead, {
    ...state,
    summary: groupSummary(state.players),
    trend: groupTrend(state.snapshots),
    rankDelta: computeRankDelta(state.snapshots),
    nextRun: nextScheduledRun(),
    staleCount: state.players.filter((player) => player.stale).length,
  });
}

/** Every Gains band for every period, computed once so switching tabs is instant. */
function computeAllGains() {
  const forEachPeriod = (compute) => ({
    day: compute(state.snapshots, state.players, ONE_DAY),
    week: compute(state.snapshots, state.players, ONE_WEEK),
    month: compute(state.snapshots, state.players, ONE_MONTH),
  });

  return {
    levels: forEachPeriod(computeLevelGains),
    xp: forEachPeriod(computeGains),
    quests: forEachPeriod(computeQuestGains),
  };
}

function render() {
  const gains = computeAllGains();

  paintMasthead();

  replaceChildren(
    dom.panel,
    renderStandings(state),
    renderGains(gains, state.gainsPeriod, (period) => setState({ gainsPeriod: period })),
    renderMatrix(
      state,
      gains.levels.day,
      (slug) => setState({ sortedBy: slug }),
      () => setState({ invertLeaders: !state.invertLeaders }),
    ),
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
    // invertLeaders: when true, the matrix highlights each row's lowest level
    // instead of its highest.
    // gainsPeriod: which window ('day' | 'week' | 'month') the Gains section shows.
    state = { ...data, sortedBy: null, invertLeaders: false, gainsPeriod: 'day' };

    document.title = `${data.group.name} · Group Ironman hiscores`;
    replaceChildren(
      dom.footer,
      el('span', {
        text: `Data from the RuneScape 3 hiscores, refreshed by GitHub Actions. Last fetch ${new Date(data.fetchedAt).toUTCString()}.`,
      }),
    );

    render();
    setInterval(paintMasthead, 60000);
  } catch (error) {
    console.error(error);
    renderFatal(error.message);
  } finally {
    document.body.dataset.ready = 'true';
  }
}

boot();
