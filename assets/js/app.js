/**
 * Application shell: loads the committed snapshot and renders one page.
 *
 * Everything is on a single view — standings, day gains, the skill matrix and
 * the competitive ladder — so nothing worth comparing is hidden behind a tab.
 * State is replaced rather than mutated, so each render is a pure function of
 * one immutable state object.
 */

import { loadGroupData } from './data.js';
import { loadPrefs, savePrefs } from './prefs.js';
import {
  CALENDAR_DAY,
  computeGains,
  computeGainsSeries,
  computeLevelGains,
  computeQuestGains,
  computeRankDelta,
  groupSummary,
  groupTrend,
  nextRunEstimate,
} from './compute.js';
import { el, replaceChildren } from './dom.js';
import { renderMasthead } from './views/masthead.js';
import { renderGains } from './views/leaderboards.js';
import { renderStandings } from './views/standings.js';
import { renderMatrix } from './views/matrix.js';

const dom = {
  masthead: document.getElementById('masthead'),
  panel: document.getElementById('panel'),
  footer: document.getElementById('footer-meta'),
};

let state = null;

const setState = (patch) => {
  state = { ...state, ...patch };
  savePrefs({
    standingsSelectedPlayer: state.standingsSelectedPlayer,
    gainsSelectedPlayer: state.gainsSelectedPlayer,
    gainsView: state.gainsView,
  });
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
    nextRun: nextRunEstimate(state.fetchedAt),
    staleCount: state.players.filter((player) => player.stale).length,
  });
}

const WEEK_SECONDS = 7 * 86400;
const MONTH_SECONDS = 30 * 86400;

/**
 * Every Gains band for every period, computed once so switching tabs is
 * instant. "Day" is calendar-aligned — since UTC midnight, resetting to zero
 * at that boundary (see CALENDAR_DAY) — while "week" and "month" are rolling
 * spans (last 7 / 30 days), since resetting those to near-zero right after a
 * calendar week/month boundary reads as broken rather than as a fresh start.
 *
 * `series` feeds the line-chart view — same three periods, but a per-player
 * time series (computeGainsSeries) rather than a single gained-over-the-window
 * figure, so the line view can plot every snapshot instead of just the ends.
 */
function computeAllGains() {
  const forEachPeriod = (compute) => ({
    day: compute(state.snapshots, state.players, CALENDAR_DAY),
    week: compute(state.snapshots, state.players, WEEK_SECONDS),
    month: compute(state.snapshots, state.players, MONTH_SECONDS),
  });

  return {
    levels: forEachPeriod(computeLevelGains),
    xp: forEachPeriod(computeGains),
    quests: forEachPeriod(computeQuestGains),
    series: {
      levels: forEachPeriod((snapshots, players, window) => computeGainsSeries(snapshots, players, window, 'level')),
      xp: forEachPeriod((snapshots, players, window) => computeGainsSeries(snapshots, players, window, 'xp')),
      quests: forEachPeriod((snapshots, players, window) => computeGainsSeries(snapshots, players, window, 'quests')),
    },
  };
}

function render() {
  const gains = computeAllGains();

  paintMasthead();

  replaceChildren(
    dom.panel,
    renderStandings(state, gains, (slug) =>
      setState({ standingsSelectedPlayer: state.standingsSelectedPlayer === slug ? null : slug }),
    ),
    renderGains(
      gains,
      state.gainsPeriod,
      (period) => setState({ gainsPeriod: period }),
      state.gainsSelectedPlayer,
      (slug) => setState({ gainsSelectedPlayer: state.gainsSelectedPlayer === slug ? null : slug }),
      state.gainsView,
      (view) => setState({ gainsView: view }),
    ),
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
    const prefs = loadPrefs();
    // A pref naming a slug outside this group's current roster (a stale
    // value from before a roster change) falls back to no selection rather
    // than highlighting nothing that exists.
    const validSlug = (slug) => (data.players.some((player) => player.slug === slug) ? slug : null);

    // sortedBy: player slug the matrix is ordered around, or null for skill order.
    // invertLeaders: when true, the matrix highlights each row's lowest level
    // instead of its highest.
    // gainsPeriod: which window ('day' | 'week' | 'month') the Gains section shows.
    // gainsView: 'grid' (the standings-style band), 'chart' (bar charts), or
    // 'line' (a time-series line per player) — picked from the icon tabs
    // beside the "Gains" title. Persisted (see prefs.js).
    // standingsSelectedPlayer / gainsSelectedPlayer: slug highlighted across
    // every cell of that grid, or null — each grid's selection is independent.
    // Persisted (see prefs.js).
    const validGainsView = ['chart', 'line'].includes(prefs.gainsView) ? prefs.gainsView : 'grid';
    state = {
      ...data,
      sortedBy: null,
      invertLeaders: false,
      gainsPeriod: 'day',
      gainsView: validGainsView,
      standingsSelectedPlayer: validSlug(prefs.standingsSelectedPlayer),
      gainsSelectedPlayer: validSlug(prefs.gainsSelectedPlayer),
    };

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
