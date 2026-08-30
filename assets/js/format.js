/** Display formatting helpers. Pure, locale-stable. */

const GROUPED = new Intl.NumberFormat('en-GB');

export const formatNumber = (value) => (Number.isFinite(value) ? GROUPED.format(Math.trunc(value)) : '—');

/** 16,449,177 → "16.4M". Used where column width matters more than precision. */
export function formatCompact(value) {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(abs >= 1e7 ? 1 : 2)}M`;
  if (abs >= 1e4) return `${Math.round(value / 1e3)}K`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return GROUPED.format(Math.trunc(value));
}

export const formatRank = (rank) => (Number.isFinite(rank) && rank > 0 ? GROUPED.format(rank) : 'unranked');

export function formatRelativeTime(isoString) {
  const then = Date.parse(isoString);
  if (!Number.isFinite(then)) return 'unknown';

  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 90) return 'just now';

  const units = [
    { limit: 3600, divisor: 60, unit: 'minute' },
    { limit: 86400, divisor: 3600, unit: 'hour' },
    { limit: 2592000, divisor: 86400, unit: 'day' },
    { limit: Infinity, divisor: 2592000, unit: 'month' },
  ];

  const match = units.find((entry) => seconds < entry.limit);
  const amount = Math.round(seconds / match.divisor);
  return `${amount} ${match.unit}${amount === 1 ? '' : 's'} ago`;
}

const UTC_DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** "24 Aug" — the per-player bar chart's x-axis label (player-gains.js). */
export const formatShortDate = (unixSeconds) => UTC_DAY.format(new Date(unixSeconds * 1000));

/** "24 Aug, 00:00 UTC" — a Gains line chart's day-mark label. Always reads
 * midnight since day marks only ever land exactly on a UTC day boundary. */
export const formatUtcMidnight = (unixSeconds) => `${formatShortDate(unixSeconds)}, 00:00 UTC`;

const UTC_WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' });

/** "Mon", "Tue" — a Weekly Highlights badge's per-day breakdown row label. */
export const formatWeekday = (unixSeconds) => UTC_WEEKDAY.format(new Date(unixSeconds * 1000));

/** Compact age for the metric strip: "18m", "2h", "3d". */
export function formatShortAge(isoString) {
  const then = Date.parse(isoString);
  if (!Number.isFinite(then)) return '—';

  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

/** Remaining time as "3h 12m" / "12m". Never negative. */
export function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return 'due';
  if (milliseconds < 60000) return '<1m';

  const totalMinutes = Math.round(milliseconds / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}
