import { CALENDAR_DAY, computeGains, computeGainsSeries, computeLevelGains, computeQuestGains, utcDayStart } from '@shared/compute.js';

export type GainsPeriod = 'day' | 'week' | 'month';
export type GainsView = 'grid' | 'line' | 'split';

const WEEK_SECONDS = 7 * 86400;
const MONTH_SECONDS = 30 * 86400;
const PERIOD_WINDOWS: Record<GainsPeriod, any> = { day: CALENDAR_DAY, week: WEEK_SECONDS, month: MONTH_SECONDS };

// The day picker (GainsSection.vue) only ever offers the last 7 calendar
// days — today (0) through six days ago — same footprint as
// computeDailyBreakdown's own default `days`.
export const MAX_DAY_OFFSET = 6;

/** The most recent snapshot's own UTC day (start-of-day, unix seconds) —
 * what CALENDAR_DAY itself already treats as "today" — or `null` with no
 * snapshots to anchor to. The Gains section's day picker (GainsSection.vue)
 * labels its seven buttons by walking back from this, same anchor
 * dayOffsetAsOf uses below. */
export function latestUtcDay(snapshots: any[]): number | null {
  const latest = snapshots[snapshots.length - 1];
  return latest ? utcDayStart(latest.t) : null;
}

/**
 * The last instant of "dayOffset days before the most recent snapshot's own
 * UTC day" — 0 is today. Every gains function's own CALENDAR_DAY window
 * resolves its cutoff from whichever snapshot it's told counts as "now"
 * (compute.js's currentSnapshot); passing this back in as that function's
 * own `asOf` is what turns an otherwise-unmodified computeGains/
 * computeQuestGains/computeLevelGains/computeGainsSeries call into "as of
 * this specific past day" instead of "as of right now". `null` when there's
 * no data to anchor "today" to at all.
 */
export function dayOffsetAsOf(snapshots: any[], dayOffset: number): number | null {
  const today = latestUtcDay(snapshots);
  return today == null ? null : today - dayOffset * 86400 + 86400 - 1;
}

// TS infers these four straight from compute.js's own JS (no .d.ts, plain
// description-only JSDoc — see PlayerView.vue/SkillMatrix.vue's own
// `CALENDAR_DAY as any` for the same friction on `window`), which mistakes
// CALENDAR_DAY's own Symbol for a plain number and, worse, infers an
// options object with no room for `asOf` at all from its `{}` default.
// Wrapping each call once here — rather than casting at every call site
// below — keeps computeAllGains itself reading like a normal, typed call.
const computeGainsAsOf = (s: any[], p: any[], asOf: number) => (computeGains as any)(s, p, CALENDAR_DAY, { asOf });
const computeQuestGainsAsOf = (s: any[], p: any[], asOf: number) => (computeQuestGains as any)(s, p, CALENDAR_DAY, { asOf });
const computeLevelGainsAsOf = (s: any[], p: any[], asOf: number) => (computeLevelGains as any)(s, p, CALENDAR_DAY, { asOf });
const computeGainsSeriesAsOf = (s: any[], p: any[], metric: string, asOf: number, relative = false) =>
  (computeGainsSeries as any)(s, p, CALENDAR_DAY, metric, { relative, asOf });

/**
 * Whichever player currently leads a Gains band (levels/xp/quests), if
 * their own current-period total beats their own total over the
 * immediately preceding period of the same length — yesterday for Day,
 * last week for Week, last month for Month. The Gains grid's own "Hot"
 * ribbon (GainsGrid.vue) marks that one entry, red-orange like every other
 * .lb-ribbon that carries no podium/Slacker/Trying colour of its own (see
 * that class' own doc comment in styles.css).
 *
 * Compared player-to-self, not top-of-this-period-to-top-of-last: this is
 * "is the leader currently outdoing their own recent pace", not a
 * leaderboard swap — a player can be #1 in both periods and still not be
 * "hot" if this period is actually the slower one.
 *
 * The previous period's own figures come from re-running the exact same
 * `compute` function against `snapshots` truncated to end where the
 * current period began (`current.from`, both computeGains and
 * computeQuestGains's own baseline timestamp) — same function, same window
 * semantics (including CALENDAR_DAY's UTC-midnight special case), just fed
 * an earlier history, rather than duplicating any of compute.js's own
 * cutoff math here. `null` (no ribbon) when there's no leader yet, or not
 * enough history to know what "last period" even looked like for them.
 */
function hotSlugFor(
  current: { rows: any[]; from: string | null },
  snapshots: any[],
  players: any[],
  window: any,
  valueKey: 'total' | 'gained',
  compute: (s: any[], p: any[], w: any) => { rows: any[] },
): string | null {
  const top = current.rows[0];
  if (!top || (top[valueKey] ?? 0) <= 0) return null;
  if (!current.from) return null;

  const cutoff = Date.parse(current.from) / 1000;
  const previousSnapshots = snapshots.filter((snapshot) => snapshot.t <= cutoff);
  if (previousSnapshots.length === 0) return null;

  const previous = compute(previousSnapshots, players, window);
  const previousRow = previous.rows.find((row: any) => row.player.slug === top.player.slug);
  const previousValue = previousRow ? (previousRow[valueKey] ?? 0) : 0;

  return top[valueKey] > previousValue ? top.player.slug : null;
}

/**
 * Every Gains band, for every period, computed once — ported from the old
 * app.js's own computeAllGains, so switching period/view tabs is instant
 * rather than recomputing on each click. `series` (relative, for the Gains
 * line view) and `totalsSeries` (raw totals, for Account Standings' line
 * view) both come from the same computeGainsSeries — see that function's
 * own doc comment on `relative`.
 *
 * `dayOffset` (0 = today, see MAX_DAY_OFFSET) re-anchors only the `day`
 * period's own entries to that past day's own figures — the Gains
 * section's day picker, for stepping back through the last week one
 * calendar day at a time without disturbing week/month at all.
 */
export function computeAllGains(snapshots: any[], players: any[], dayOffset = 0) {
  const forEachPeriod = (compute: (s: any[], p: any[], w: any) => any) => ({
    day: compute(snapshots, players, CALENDAR_DAY),
    week: compute(snapshots, players, WEEK_SECONDS),
    month: compute(snapshots, players, MONTH_SECONDS),
  });

  const levels = forEachPeriod(computeLevelGains);
  const xp = forEachPeriod(computeGains);
  const quests = forEachPeriod(computeQuestGains);

  const asOf = dayOffset > 0 ? dayOffsetAsOf(snapshots, dayOffset) : null;
  if (asOf != null) {
    levels.day = computeLevelGainsAsOf(snapshots, players, asOf);
    xp.day = computeGainsAsOf(snapshots, players, asOf);
    quests.day = computeQuestGainsAsOf(snapshots, players, asOf);
  }

  const hotForEachPeriod = (perPeriod: Record<GainsPeriod, any>, valueKey: 'total' | 'gained', compute: (s: any[], p: any[], w: any) => any) => ({
    day: hotSlugFor(perPeriod.day, snapshots, players, PERIOD_WINDOWS.day, valueKey, compute),
    week: hotSlugFor(perPeriod.week, snapshots, players, PERIOD_WINDOWS.week, valueKey, compute),
    month: hotSlugFor(perPeriod.month, snapshots, players, PERIOD_WINDOWS.month, valueKey, compute),
  });

  const series = {
    levels: forEachPeriod((s, p, w) => computeGainsSeries(s, p, w, 'level', { relative: true })),
    xp: forEachPeriod((s, p, w) => computeGainsSeries(s, p, w, 'xp', { relative: true })),
    quests: forEachPeriod((s, p, w) => computeGainsSeries(s, p, w, 'quests', { relative: true })),
  };
  const totalsSeries = {
    levels: forEachPeriod((s, p, w) => computeGainsSeries(s, p, w, 'level')),
    xp: forEachPeriod((s, p, w) => computeGainsSeries(s, p, w, 'xp')),
    quests: forEachPeriod((s, p, w) => computeGainsSeries(s, p, w, 'quests')),
  };
  if (asOf != null) {
    series.levels.day = computeGainsSeriesAsOf(snapshots, players, 'level', asOf, true);
    series.xp.day = computeGainsSeriesAsOf(snapshots, players, 'xp', asOf, true);
    series.quests.day = computeGainsSeriesAsOf(snapshots, players, 'quests', asOf, true);
    totalsSeries.levels.day = computeGainsSeriesAsOf(snapshots, players, 'level', asOf);
    totalsSeries.xp.day = computeGainsSeriesAsOf(snapshots, players, 'xp', asOf);
    totalsSeries.quests.day = computeGainsSeriesAsOf(snapshots, players, 'quests', asOf);
  }

  return {
    levels,
    xp,
    quests,
    hot: {
      levels: hotForEachPeriod(levels, 'total', computeLevelGains),
      xp: hotForEachPeriod(xp, 'total', computeGains),
      quests: hotForEachPeriod(quests, 'gained', computeQuestGains),
    },
    series,
    totalsSeries,
  };
}

export type AllGains = ReturnType<typeof computeAllGains>;
