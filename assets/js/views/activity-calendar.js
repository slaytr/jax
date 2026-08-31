import { el } from '../dom.js';
import { computeActivityCalendar, ACTIVITY_CALENDAR_WEEKS } from '../compute.js';
import { bindTooltip, tooltipContent } from '../tooltip.js';
import { formatNumber } from '../format.js';

const MONTH_LABEL = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' });
const CELL_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/**
 * One day square. `day` is undefined for a cell past "today" — the current,
 * still-unfinished week pads out the grid's last column — which gets an
 * inert placeholder rather than a real (untracked) cell: there's nothing to
 * say about a day that hasn't happened yet, unlike one that predates this
 * group's own tracking (`day.gained === null`), which still gets a tooltip
 * explaining why it's blank.
 */
function daySquare(day, maxGained) {
  if (!day) return el('div', { class: 'activity-cal-cell is-placeholder', 'aria-hidden': 'true' });

  if (day.gained === null) {
    const node = el('div', { class: 'activity-cal-cell is-untracked' });
    return bindTooltip(node, () =>
      tooltipContent(CELL_DATE.format(new Date(day.dayStart * 1000)), [['XP gained', 'not tracked yet']]),
    );
  }

  // The brightest square is always this player's own single best day in the
  // window — a quiet week and a grinding week each use the calendar's full
  // shade range, rather than everyone being judged against one fixed scale.
  // A real (if small) gain still gets a visible floor tint so it doesn't
  // read as indistinguishable from a true zero-xp day.
  const ratio = maxGained > 0 ? day.gained / maxGained : 0;
  const fillPct = day.gained > 0 ? 15 + ratio * 85 : 0;

  const node = el('div', {
    class: `activity-cal-cell${day.gained === 0 ? ' is-zero' : ''}`,
    style: { '--fill-pct': `${fillPct}%` },
  });

  return bindTooltip(node, () =>
    tooltipContent(CELL_DATE.format(new Date(day.dayStart * 1000)), [
      ['XP gained', day.gained > 0 ? formatNumber(day.gained) : 'none'],
    ]),
  );
}

/**
 * Month initials above the grid, one per column where a new month begins —
 * consecutive columns still inside the same month stay blank, same
 * skip-if-already-labelled idea GitHub's own calendar uses.
 */
// Minimum columns between two shown labels — without this, a grid whose
// very first column happens to land on a month's last few days would show
// that month's initial immediately beside next month's, one column (13px)
// apart, for two labels that need much more room than that to not overlap.
const MIN_LABEL_GAP = 2;

function monthLabels(days, weeks) {
  const labels = [];
  let lastMonth = null;
  let lastLabelColumn = -Infinity;

  for (let column = 0; column < weeks; column += 1) {
    const first = days[column * 7];
    const month = first ? new Date(first.dayStart * 1000).getUTCMonth() : null;
    const monthChanged = month !== null && month !== lastMonth;
    if (monthChanged) lastMonth = month;

    const showLabel = monthChanged && column - lastLabelColumn >= MIN_LABEL_GAP;
    if (showLabel) lastLabelColumn = column;
    labels.push(el('span', { class: 'activity-cal-month', text: showLabel ? MONTH_LABEL.format(new Date(first.dayStart * 1000)) : '' }));
  }

  return el('div', { class: 'activity-cal-months' }, labels);
}

/**
 * The per-player masthead's GitHub-style activity tracker: one small square
 * per day over the last year, shaded by that day's xp gain relative to this
 * player's own best day in the window (see daySquare). Rides in the same row
 * as the identity block, drawn at a fixed size (styles.css's `.activity-cal`
 * — fixed-px cells, never dynamically resized) so the calendar itself never
 * has to give up any detail to make room for anything else.
 *
 * Below a phone-width screen there's nothing left it can borrow room from,
 * though, so `.activity-cal` caps at 100% of the row and scrolls internally
 * past that (styles.css) rather than overflowing the page — pre-scrolled to
 * its right edge here so a mobile viewer's first look is the most recent
 * days, not a year-old Sunday.
 *
 * @param player a decorated player (data.js) — only `slug` is read.
 * @param snapshots data.js's full history array, same shape every other
 *   Gains computation reads.
 */
export function renderActivityCalendar(player, snapshots) {
  const days = computeActivityCalendar(snapshots, player.slug);
  if (days.length === 0) return null;

  const maxGained = days.reduce((max, day) => (day.gained !== null && day.gained > max ? day.gained : max), 0);

  const cells = [];
  for (let column = 0; column < ACTIVITY_CALENDAR_WEEKS; column += 1) {
    for (let row = 0; row < 7; row += 1) {
      cells.push(daySquare(days[column * 7 + row], maxGained));
    }
  }

  const container = el('div', { class: 'activity-cal' }, [
    monthLabels(days, ACTIVITY_CALENDAR_WEEKS),
    el('div', { class: 'activity-cal-grid' }, cells),
  ]);

  // Deferred: scrollWidth only reflects the grid's real width once
  // `container` has an actual layout box, which needs it attached to the
  // document — replaceChildren does that synchronously right after this
  // function returns, so the very next paint is the earliest safe point. A
  // no-op whenever max-width hasn't actually kicked in (scrollWidth ===
  // clientWidth already, nothing to scroll to).
  requestAnimationFrame(() => {
    container.scrollLeft = container.scrollWidth;
  });

  return container;
}
