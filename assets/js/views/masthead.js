import { el, svgEl, swatch, replaceChildren } from '../dom.js';
import { formatDuration, formatCompact, formatNumber, formatRelativeTime, formatShortAge } from '../format.js';

/**
 * A compact metric bar rather than a hero banner: the scoreboard's job is to
 * relay numbers, so the identity block stays small and the figures lead.
 */

/** `key` drives grid placement, so the narrow layout can reorder without JS. */
function metric(key, label, value, extra, title) {
  return el('div', { class: `metric metric-${key}`, title }, [
    el('p', { class: 'metric-label', text: label }),
    el('p', { class: 'metric-value' }, [el('span', { text: value }), extra]),
  ]);
}

/**
 * Day-over-day ladder movement. A lower rank number is better, so a positive
 * delta is a climb — but the rank *number* itself went down to get there, so
 * the arrow points down for a climb and up for a drop, matching the number's
 * own direction rather than the "climbing" metaphor. Colour still carries
 * good/bad (green for a climb, red for a drop); the arrow and hidden word
 * carry direction, never colour alone.
 */
function rankDeltaBadge(rankDelta) {
  if (!rankDelta || rankDelta.delta === 0) return null;

  const climbed = rankDelta.delta > 0;
  const places = Math.abs(rankDelta.delta);

  return el('span', { class: `delta ${climbed ? 'is-better' : 'is-worse'}` }, [
    el('span', { 'aria-hidden': 'true', text: climbed ? '▼' : '▲' }),
    el('span', { text: formatNumber(places) }),
    el('span', {
      class: 'visually-hidden',
      text: ` places ${climbed ? 'up' : 'down'} since ${formatRelativeTime(rankDelta.from)}`,
    }),
  ]);
}

/** One roster member's link in the "Stats:" line — a plain inline link to
 * their own /stats/<slug>/ page, led by a swatch so identity still comes
 * from more than colour alone (the link text itself stays an ink token,
 * never the player's own hue — see the dataviz skill's own text-vs-mark
 * rule). There's no "current" player here — the group page isn't any one
 * player's, so every name is just a link. */
const playerNavItem = (player) =>
  el('a', { class: 'player-nav-item', style: { '--accent': player.colour }, href: `stats/${player.slug}/` }, [
    swatch(player.colour),
    el('span', { text: player.name }),
  ]);

/** "Personal stat pages: Name · Name · Name…" — every roster member's
 * stats-page link, inline with the title rather than off in the metric
 * strip's corner, since it's a way to *leave* this page, not one more
 * figure the strip relays. */
function playerNavLine(players) {
  const items = players.flatMap((player, index) => [
    index > 0 ? el('span', { class: 'dot', 'aria-hidden': 'true', text: '·' }) : null,
    playerNavItem(player),
  ]);

  return el('p', { class: 'identity-stats' }, [el('span', { class: 'identity-stats-label', text: 'Personal stat pages:' }), ...items]);
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
  const { group, players, summary, trend, fetchedAt, staleCount, groupRank, rankDelta, nextRun } = state;

  const rankValue = groupRank && Number.isFinite(groupRank.rank) ? formatNumber(groupRank.rank) : '—';

  const fetchedTitle = fetchedAt ? `Fetched ${new Date(fetchedAt).toUTCString()}` : undefined;
  const nextTitle = nextRun
    ? `Expected around ${nextRun.toUTCString()}, one hour after the last fetch. GitHub runs cron jobs on a best-effort basis, so it may be later.`
    : undefined;

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

        // No permanent tagline line — only shown at all when there's
        // actually something to flag (a stale reading), so the row simply
        // isn't there the rest of the time rather than sitting empty.
        staleCount > 0 ? el('p', { class: 'identity-sub' }, [el('span', { class: 'warn', text: `${staleCount} cached` })]) : null,

        playerNavLine(players),
      ]),

      el('div', { class: 'metrics' }, [
        metric('rank', 'Group rank', rankValue),
        metric('level', 'Total level', formatNumber(summary.totalLevel)),
        metric('xp', 'Total xp', formatCompact(summary.totalXp), sparkline(trend)),
        metric('skills', '99s', formatNumber(summary.maxedSkills)),
        metric('updated', 'Last updated', formatShortAge(fetchedAt), null, fetchedTitle),
        metric(
          'next',
          'Next update in',
          nextRun ? formatDuration(nextRun.getTime() - Date.now()) : '—',
          null,
          nextTitle,
        ),
      ]),
    ]),
  );
}
