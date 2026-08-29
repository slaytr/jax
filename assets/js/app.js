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
  computeDailyBreakdown,
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
import { renderHighlights, HIGHLIGHT_METRICS } from './views/highlights.js';
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
    standingsView: state.standingsView,
    gainsGridPeriod: state.gainsGridPeriod,
    gainsLinePeriod: state.gainsLinePeriod,
  });
  render();
};

/** Gains' grid and line views each remember their own last-used Day/Week/Month
 * window (see `gainsGridPeriod`/`gainsLinePeriod` below) rather than sharing
 * one — switching views switches which of the two the period tabs read from
 * and write to. */
const currentGainsPeriod = () => (state.gainsView === 'line' ? state.gainsLinePeriod : state.gainsGridPeriod);
const setGainsPeriod = (period) =>
  setState(state.gainsView === 'line' ? { gainsLinePeriod: period } : { gainsGridPeriod: period });

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
 * `series` feeds the Gains section's line-chart view — same three periods,
 * but a per-player time series (computeGainsSeries, `relative: true`) of
 * each player's gain since the window's start, rather than a single
 * gained-over-the-window figure, so the line view can plot every snapshot
 * instead of just the ends. `totalsSeries` feeds Account Standings' line
 * view the same way, but plots raw totals over time (no `relative`), since
 * that section is about standings, not gains.
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
      levels: forEachPeriod((snapshots, players, window) =>
        computeGainsSeries(snapshots, players, window, 'level', { relative: true }),
      ),
      xp: forEachPeriod((snapshots, players, window) => computeGainsSeries(snapshots, players, window, 'xp', { relative: true })),
      quests: forEachPeriod((snapshots, players, window) =>
        computeGainsSeries(snapshots, players, window, 'quests', { relative: true }),
      ),
    },
    totalsSeries: {
      levels: forEachPeriod((snapshots, players, window) => computeGainsSeries(snapshots, players, window, 'level')),
      xp: forEachPeriod((snapshots, players, window) => computeGainsSeries(snapshots, players, window, 'xp')),
      quests: forEachPeriod((snapshots, players, window) => computeGainsSeries(snapshots, players, window, 'quests')),
    },
  };
}

/** The week's top gainer for one metric, or null when nobody gained anything —
 * a 0-value leader (e.g. a brand-new group) isn't a real "winner" to crown. */
function topWeeklyGainer(result, valueKey) {
  const top = result.rows[0];
  return top && top[valueKey] > 0 ? { player: top.player, value: top[valueKey] } : null;
}

/**
 * The Weekly Highlights row's three badges — always the *week* window
 * regardless of whatever period the Gains section itself is showing, same
 * reasoning as Account Standings' line view being pinned to month. Each
 * entry also carries its winner's last-7-days breakdown (computeDailyBreakdown,
 * against the raw snapshots rather than the pre-aggregated `gains` bands, since
 * that's a per-player figure the week-level totals don't carry).
 */
function computeHighlights(gains) {
  const winners = {
    level: topWeeklyGainer(gains.levels.week, 'total'),
    xp: topWeeklyGainer(gains.xp.week, 'total'),
    quests: topWeeklyGainer(gains.quests.week, 'gained'),
  };

  return HIGHLIGHT_METRICS.map((metric) => {
    const winner = winners[metric];
    return {
      key: metric,
      winner,
      breakdown: winner ? computeDailyBreakdown(state.snapshots, winner.player.slug, metric, 7) : [],
    };
  });
}

// The Gains period shown on the *previous* render, tracked outside `state` —
// it's a rendering detail (driving the period tabs' slide animation when a
// view switch changes the effective period), not app state to persist or
// react to. `null` until the first render happens.
let lastGainsPeriod = null;

function render() {
  const gains = computeAllGains();
  const gainsPeriod = currentGainsPeriod();
  const previousGainsPeriod = lastGainsPeriod;
  lastGainsPeriod = gainsPeriod;

  paintMasthead();

  replaceChildren(
    dom.panel,
    renderHighlights(computeHighlights(gains)),
    renderGains(
      gains,
      gainsPeriod,
      setGainsPeriod,
      state.gainsSelectedPlayer,
      (slug) => setState({ gainsSelectedPlayer: state.gainsSelectedPlayer === slug ? null : slug }),
      state.gainsView,
      (view) => setState({ gainsView: view }),
      previousGainsPeriod,
    ),
    renderStandings(
      state,
      gains,
      gainsPeriod,
      (slug) => setState({ standingsSelectedPlayer: state.standingsSelectedPlayer === slug ? null : slug }),
      state.standingsView,
      (view) => setState({ standingsView: view }),
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
    // gainsGridPeriod / gainsLinePeriod: which window ('day' | 'week' | 'month')
    // Gains' grid and line views each last showed — tracked separately so
    // switching views doesn't move the other's date range, with different
    // defaults ('day' for the grid, 'week' for the line chart, since a single
    // day's line is often just one or two points). See currentGainsPeriod/
    // setGainsPeriod above. Persisted (see prefs.js).
    // gainsView: 'grid' (the standings-style band) or 'line' (a time-series
    // line per player) — picked from the icon tabs beside the "Gains" title.
    // Persisted (see prefs.js).
    // standingsView: 'grid' or 'line' — same idea, picked from the icon tabs
    // beside the "Account standings" title. Persisted (see prefs.js).
    // standingsSelectedPlayer / gainsSelectedPlayer: slug highlighted across
    // every cell of that grid, or null — each grid's selection is independent.
    // Persisted (see prefs.js).
    const isPeriod = (value) => ['day', 'week', 'month'].includes(value);
    const validGainsView = prefs.gainsView === 'line' ? 'line' : 'grid';
    const validStandingsView = prefs.standingsView === 'line' ? 'line' : 'grid';
    state = {
      ...data,
      sortedBy: null,
      invertLeaders: false,
      gainsGridPeriod: isPeriod(prefs.gainsGridPeriod) ? prefs.gainsGridPeriod : 'day',
      gainsLinePeriod: isPeriod(prefs.gainsLinePeriod) ? prefs.gainsLinePeriod : 'week',
      gainsView: validGainsView,
      standingsView: validStandingsView,
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
