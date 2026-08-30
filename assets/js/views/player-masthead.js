import { el, replaceChildren } from '../dom.js';
import { formatCompact, formatNumber, formatRank, formatShortAge } from '../format.js';

/** Same primitive as the group masthead's own `metric` (masthead.js) — kept
 * as a local copy rather than exported/shared, since the two mastheads are
 * never rendered by the same call site and a shared import would be the only
 * thing coupling them. */
function metric(key, label, value, title) {
  return el('div', { class: `metric metric-${key}`, title }, [
    el('p', { class: 'metric-label', text: label }),
    el('p', { class: 'metric-value' }, [el('span', { text: value })]),
  ]);
}

/**
 * The per-player page's header: a back link to the group page, the player's
 * name, and their headline figures — same `.topbar` / `.metrics` chrome as
 * the group masthead (masthead.js), so the two pages read as one family
 * rather than a bolted-on second design.
 *
 * @param container the page's #masthead element.
 * @param player a decorated player (data.js).
 * @param groupName for the back link's label.
 * @param fetchedAt latest.json's fetchedAt, for the "as of" title on Updated.
 */
export function renderPlayerMasthead(container, { player, groupName, fetchedAt }) {
  const known = Number.isFinite(player.questPoints);
  const fetchedTitle = fetchedAt ? `Fetched ${new Date(fetchedAt).toUTCString()}` : undefined;

  replaceChildren(
    container,
    el('p', { class: 'back-link' }, [
      el('a', { href: '../../' }, [el('span', { 'aria-hidden': 'true', text: '← ' }), el('span', { text: groupName })]),
    ]),
    el('div', { class: 'topbar' }, [
      el('div', { class: 'identity' }, [
        el('h1', { class: 'wordmark', text: player.name }),
        player.stale ? el('p', { class: 'identity-sub' }, [el('span', { class: 'warn', text: 'cached' })]) : null,
      ]),
      el('div', { class: 'metrics' }, [
        metric('level', 'Total level', formatNumber(player.total?.level ?? 0)),
        metric('xp', 'Total xp', formatCompact(player.total?.xp ?? 0)),
        metric('quests', 'Quest points', known ? formatNumber(player.questPoints) : '—'),
        metric('rank', 'Overall rank', formatRank(player.total?.rank ?? null)),
        metric('updated', 'Last updated', formatShortAge(fetchedAt), fetchedTitle),
      ]),
    ]),
  );
}
