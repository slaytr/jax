import { CALENDAR_DAY, computeGains, computeGainsSeries, computeLevelGains, computeQuestGains } from '@shared/compute.js';

export type GainsPeriod = 'day' | 'week' | 'month';
export type GainsView = 'grid' | 'line';

const WEEK_SECONDS = 7 * 86400;
const MONTH_SECONDS = 30 * 86400;
const PERIOD_WINDOWS: Record<GainsPeriod, any> = { day: CALENDAR_DAY, week: WEEK_SECONDS, month: MONTH_SECONDS };

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
 */
export function computeAllGains(snapshots: any[], players: any[]) {
  const forEachPeriod = (compute: (s: any[], p: any[], w: any) => any) => ({
    day: compute(snapshots, players, CALENDAR_DAY),
    week: compute(snapshots, players, WEEK_SECONDS),
    month: compute(snapshots, players, MONTH_SECONDS),
  });

  const levels = forEachPeriod(computeLevelGains);
  const xp = forEachPeriod(computeGains);
  const quests = forEachPeriod(computeQuestGains);

  const hotForEachPeriod = (perPeriod: Record<GainsPeriod, any>, valueKey: 'total' | 'gained', compute: (s: any[], p: any[], w: any) => any) => ({
    day: hotSlugFor(perPeriod.day, snapshots, players, PERIOD_WINDOWS.day, valueKey, compute),
    week: hotSlugFor(perPeriod.week, snapshots, players, PERIOD_WINDOWS.week, valueKey, compute),
    month: hotSlugFor(perPeriod.month, snapshots, players, PERIOD_WINDOWS.month, valueKey, compute),
  });

  return {
    levels,
    xp,
    quests,
    hot: {
      levels: hotForEachPeriod(levels, 'total', computeLevelGains),
      xp: hotForEachPeriod(xp, 'total', computeGains),
      quests: hotForEachPeriod(quests, 'gained', computeQuestGains),
    },
    series: {
      levels: forEachPeriod((s, p, w) => computeGainsSeries(s, p, w, 'level', { relative: true })),
      xp: forEachPeriod((s, p, w) => computeGainsSeries(s, p, w, 'xp', { relative: true })),
      quests: forEachPeriod((s, p, w) => computeGainsSeries(s, p, w, 'quests', { relative: true })),
    },
    totalsSeries: {
      levels: forEachPeriod((s, p, w) => computeGainsSeries(s, p, w, 'level')),
      xp: forEachPeriod((s, p, w) => computeGainsSeries(s, p, w, 'xp')),
      quests: forEachPeriod((s, p, w) => computeGainsSeries(s, p, w, 'quests')),
    },
  };
}

export type AllGains = ReturnType<typeof computeAllGains>;
