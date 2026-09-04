import { el } from '../dom.js';
import { statusOf } from './player-quests.js';

/**
 * A handful of series where the wiki's own `seriesPosition` picks a quest
 * that doesn't actually read as the story's own conclusion — not a data
 * error exactly (quests.json only ever mirrors the wiki's own infobox
 * fields — see quest-data/README.md, and it's regenerated wholesale on
 * every refetch rather than hand-edited), just the wrong quest for *this*
 * chip's specific purpose. Checked before falling back to "highest
 * seriesPosition" below, by name rather than position, so a refetch that
 * renumbers or adds quests to the series can't silently point this at
 * something else without the override name itself failing to resolve.
 *
 * - **Fort Forinthry**: seriesPosition's own pick is "Princess and the
 *   Pauper" (position 9, a same-titled quest tacked onto this series
 *   despite reading as its own separate side story) over "Ode of the
 *   Devourer" (position 8, where Fort Forinthry's own main thread actually
 *   lands).
 */
const SERIES_FINAL_QUEST_OVERRIDES = {
  'Fort Forinthry': 'Ode of the Devourer',
};

/**
 * One quick-link chip per questline, sitting above the quest list/
 * dependency map so a viewer chasing a specific story arc (Mahjarrat
 * Mysteries, Elf, Myreque, ...) can jump straight to it instead of
 * searching or scrolling for each member individually. `quest.series`
 * (quest-data/quests.json — each quest's own wiki infobox, the same
 * categorisation the wiki's "List of quest series" page itself draws from)
 * is what groups quests into one chip; `seriesPosition` (or
 * SERIES_FINAL_QUEST_OVERRIDES above, for a couple of series it picks
 * wrong) still names the series' own "final" quest for the tooltip, even
 * though clicking no longer jumps to that one quest alone.
 *
 * A chip reads "<series> <completed>/<total>" — e.g. "Fairy 2/4" — this
 * player's own progress through the series (statusOf, player-quests.js,
 * the same completed/started sets the list and the dependency map read
 * off), not the final quest's own position (which would just be `total`
 * repeated and say nothing about how far along they actually are).
 *
 * Clicking a chip calls `onSelectSeries` with the series' own name (stats.js)
 * — every quest tagged with that series becomes its own node in the
 * dependency map at once (quest-graph.js's multi-target
 * dependencyGraphFor/visibleDependencyGraph), even a side quest nothing
 * else in the series requires, rather than just the one quest a plain list
 * row would select. Same click-to-toggle shape as a list row too: clicking
 * the already-selected series' chip again deselects it.
 *
 * `collapsed`/`onToggleCollapsed` fold the whole chip row away behind its
 * own heading (a real `<button>` around it, chevron + name + count, same
 * shape as the Goals tab's own collapsible group headings) — persisted by
 * the caller (stats.js's questlinesCollapsed, saveStatsState) rather than
 * reset on reload like the Goals tab's collapsed groups, since a viewer
 * who never uses this row would otherwise have to re-collapse it on every
 * visit.
 *
 * `hideCompleted`/`onToggleHideCompleted` (same persisted-preference
 * treatment, stats.js's own questlinesHideCompleted) trims chips whose
 * completed count already equals total — the count badge in the heading
 * keeps counting every questline regardless, since that's "how many
 * exist," not "how many are offered right now."
 */
export function renderQuestSeriesLinks(quests, player, selectedSeriesName, collapsed, onToggleCollapsed, hideCompleted, onToggleHideCompleted, onSelectSeries) {
  if (!quests) return null;

  const bySeries = new Map();
  for (const quest of quests) {
    if (!quest.series) continue;
    if (!bySeries.has(quest.series)) bySeries.set(quest.series, []);
    bySeries.get(quest.series).push(quest);
  }
  if (bySeries.size === 0) return null;

  const completedSet = new Set(player.completedQuests ?? []);
  const startedSet = new Set(player.startedQuests ?? []);

  const series = [...bySeries.entries()]
    .map(([name, members]) => {
      const overrideName = SERIES_FINAL_QUEST_OVERRIDES[name];
      const override = overrideName ? members.find((member) => member.name === overrideName) : undefined;
      return {
        name,
        total: members.length,
        completed: members.filter((member) => statusOf(member, completedSet, startedSet) === 'completed').length,
        final: override ?? members.reduce((latest, member) => (member.seriesPosition > latest.seriesPosition ? member : latest)),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const visibleSeries = hideCompleted ? series.filter(({ total, completed }) => completed !== total) : series;

  return el('section', { class: `lb quest-series-card${collapsed ? ' is-collapsed' : ''}` }, [
    el('div', { class: 'lb-head' }, [
      el(
        'button',
        {
          type: 'button',
          class: 'quest-series-toggle',
          'aria-expanded': collapsed ? 'false' : 'true',
          onclick: onToggleCollapsed,
        },
        [
          el('span', { class: 'quest-series-chevron', 'aria-hidden': 'true' }),
          el('h2', { text: 'Questlines' }),
          el('span', { class: 'quest-series-count', text: String(series.length) }),
        ],
      ),
      el('label', { class: 'quest-series-hide-completed' }, [
        el('input', { type: 'checkbox', checked: hideCompleted ? true : undefined, onchange: onToggleHideCompleted }),
        el('span', { text: 'Hide completed' }),
      ]),
    ]),
    collapsed
      ? null
      : visibleSeries.length > 0
        ? el(
            'div',
            { class: 'quest-series-links' },
            visibleSeries.map(({ name, total, completed, final }) =>
              el('button', {
                type: 'button',
                class: `quest-series-link${name === selectedSeriesName ? ' is-selected' : ''}${completed === total ? ' is-done' : ''}`,
                title: `Show every quest in the ${name} series (ends with ${final.name})`,
                onclick: () => onSelectSeries(name),
                text: `${name} ${completed}/${total}`,
              }),
            ),
          )
        : el('p', { class: 'quest-series-empty', text: 'Every questline is completed.' }),
  ]);
}
