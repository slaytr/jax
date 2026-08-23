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

export const formatSigned = (value) => {
  if (!Number.isFinite(value) || value === 0) return '0';
  return `${value > 0 ? '+' : '−'}${formatCompact(Math.abs(value))}`;
};

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

export function formatDate(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Initials for the player marker, e.g. "Cpt Draynor" → "CD". */
export function initials(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
