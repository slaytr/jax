import { el, svgEl, replaceChildren } from '../dom.js';
import { formatCompact, formatNumber, formatRelativeTime } from '../format.js';

/**
 * A compact metric bar rather than a hero banner: the scoreboard's job is to
 * relay numbers, so the identity block stays small and the figures lead.
 */

/** `key` drives grid placement, so the narrow layout can reorder without JS. */
function metric(key, label, value, extra) {
  return el('div', { class: `metric metric-${key}` }, [
    el('p', { class: 'metric-label', text: label }),
    el('p', { class: 'metric-value' }, [el('span', { text: value }), extra]),
  ]);
}

/**
 * Day-over-day ladder movement. A lower rank number is better, so a positive
 * delta is a climb. Direction is carried by an arrow and a word, never by
 * colour alone.
 */
function rankDeltaBadge(rankDelta) {
  if (!rankDelta || rankDelta.delta === 0) return null;

  const climbed = rankDelta.delta > 0;
  const places = Math.abs(rankDelta.delta);

  return el('span', { class: `delta ${climbed ? 'is-up' : 'is-down'}` }, [
    el('span', { 'aria-hidden': 'true', text: climbed ? '▲' : '▼' }),
    el('span', { text: formatNumber(places) }),
    el('span', {
      class: 'visually-hidden',
      text: ` places ${climbed ? 'up' : 'down'} since ${formatRelativeTime(rankDelta.from)}`,
    }),
  ]);
}

/** Group XP trend. Unlabelled by design — exact numbers live in the Gains view. */
function sparkline(trend) {
  if (!trend) return null;

  const width = 132;
  const height = 26;
  const pad = 2;
  const toX = (x) => pad + x * (width - pad * 2);
  const toY = (y) => height - pad - y * (height - pad * 2);

  const line = trend.map((point) => `${toX(point.x).toFixed(1)},${toY(point.y).toFixed(1)}`).join(' ');
  const last = trend[trend.length - 1];

  const svg = svgEl('svg', {
    class: 'sparkline',
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': `Group experience trend across ${trend.length} snapshots`,
  });

  svg.append(
    svgEl('polygon', { points: `${toX(0)},${height - pad} ${line} ${toX(1)},${height - pad}`, class: 'sparkline-area' }),
    svgEl('polyline', { points: line, class: 'sparkline-line' }),
    svgEl('circle', { cx: toX(last.x), cy: toY(last.y), r: 2.5, class: 'sparkline-head' }),
  );
  return svg;
}

export function renderMasthead(container, state) {
  const { group, summary, trend, fetchedAt, staleCount, groupRank, rankDelta } = state;

  const rankValue = groupRank && Number.isFinite(groupRank.rank) ? formatNumber(groupRank.rank) : '—';

  replaceChildren(
    container,
    el('div', { class: 'topbar' }, [
      el('div', { class: 'identity' }, [
        el('h1', { class: 'wordmark', text: group.name }),

        // Shown only where the metric strip has no room for the rank column.
        el('span', { class: 'identity-rank' }, [
          el('span', { class: 'identity-rank-label', text: 'Rank' }),
          el('span', { class: 'identity-rank-value', text: rankValue }),
          rankDeltaBadge(rankDelta),
        ]),

        el('p', { class: 'identity-sub' }, [
          el('span', { text: group.tagline || 'Group Ironman' }),
          el('span', { class: 'dot identity-accounts', 'aria-hidden': 'true', text: '·' }),
          el('span', { class: 'identity-accounts', text: `${summary.playerCount} accounts` }),
          staleCount > 0 ? el('span', { class: 'dot', 'aria-hidden': 'true', text: '·' }) : null,
          staleCount > 0 ? el('span', { class: 'warn', text: `${staleCount} cached` }) : null,
        ]),
      ]),

      el('div', { class: 'metrics' }, [
        metric('rank', 'Group rank', rankValue, rankDeltaBadge(rankDelta)),
        metric('level', 'Total level', formatNumber(summary.totalLevel)),
        metric('xp', 'Total xp', formatCompact(summary.totalXp), sparkline(trend)),
        metric('skills', 'Skills 99', formatNumber(summary.maxedSkills)),
        metric('updated', 'Updated', formatRelativeTime(fetchedAt).replace(' ago', '')),
      ]),
    ]),
  );
}
