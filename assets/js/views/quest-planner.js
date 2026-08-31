import { el } from '../dom.js';
import { SKILLS, iconFor } from '../config.js';
import { computeQuestPlan } from '../quest-planner.js';

const SKILL_BY_NAME = new Map(SKILLS.map((skill) => [skill.name, skill]));

/** One missing skill requirement, icon-led — same small-chip anatomy as the
 * dependency map's own skillChip (quest-dependency-graph.js), always
 * "not met" here since every chip on this card is, by definition, a gap the
 * player hasn't closed yet. */
function skillGapChip(req) {
  const skill = SKILL_BY_NAME.get(req.skill);
  return el('span', { class: 'quest-graph-node-skill is-not-met', title: `${req.skill} ${req.level}` }, [
    skill ? el('img', { src: iconFor(skill), alt: '', width: 12, height: 12, decoding: 'async' }) : null,
    el('span', { text: req.level }),
  ]);
}

/** A candidate's own clickable name — the shared row anatomy behind every
 * list in this card. Clicking it anchors the dependency map on this quest,
 * same as a Quests-tab list row (onSelectQuest, stats.js), so a suggestion
 * doubles as a shortcut into "why do I need this / what does it lead to". */
function questLink(quest, onSelectQuest, extraClass = '') {
  return el('button', {
    type: 'button',
    class: `quest-plan-name${extraClass}`,
    title: `Show ${quest.name}'s dependency chain`,
    text: quest.name,
    onclick: () => onSelectQuest(quest),
  });
}

function readyNowItem(candidate, onSelectQuest) {
  return el('li', { class: 'quest-plan-item' }, [
    questLink(candidate.quest, onSelectQuest),
    candidate.unlocks > 0
      ? el('span', { class: 'quest-plan-unlocks', title: `Unlocks ${candidate.unlocks} other quest${candidate.unlocks === 1 ? '' : 's'}` }, [
          `→ ${candidate.unlocks}`,
        ])
      : null,
  ]);
}

function almostThereItem(candidate, onSelectQuest) {
  return el('li', { class: 'quest-plan-item' }, [
    questLink(candidate.quest, onSelectQuest),
    el('span', { class: 'quest-graph-node-skills' }, candidate.missingSkills.map(skillGapChip)),
  ]);
}

function questlineItem(line, onSelectSeries, onSelectQuest) {
  const next = line.next;
  return el('li', { class: 'quest-plan-item quest-plan-line-item' }, [
    el('button', {
      type: 'button',
      class: 'quest-plan-name',
      title: `Show every quest in the ${line.series} series`,
      onclick: () => onSelectSeries(line.series),
      text: `${line.series} ${line.completedCount}/${line.total}`,
    }),
    next
      ? el('span', { class: 'quest-plan-line-next' }, [
          el('span', { class: 'quest-plan-line-next-label', text: 'Next: ' }),
          questLink(next.quest, onSelectQuest, ' quest-plan-line-next-name'),
          next.missingSkills.length > 0
            ? el('span', { class: 'quest-graph-node-skills' }, next.missingSkills.map(skillGapChip))
            : null,
        ])
      : null,
  ]);
}

function planSection(title, emptyText, items) {
  return el('div', { class: 'quest-plan-section' }, [
    el('h3', { class: 'quest-plan-heading', text: title }),
    items.length > 0 ? el('ul', { class: 'quest-plan-list' }, items) : el('p', { class: 'quest-plan-empty', text: emptyText }),
  ]);
}

/**
 * The Quests tab's Planner — sits under the quest list/dependency map row
 * (stats.js), advising what to work on next from three angles
 * (computeQuestPlan, quest-planner.js): quests with nothing at all left in
 * the way ("Ready now"), quests blocked only by a small skill gap ("Almost
 * there"), and questlines already underway, each paired with its own
 * closest-to-actionable remaining member. Every suggestion is clickable —
 * a quest name anchors the dependency map on it (onSelectQuest, same
 * handler the quest list's own rows use), a questline name anchors it on
 * the whole series (onSelectSeries, same handler quest-series-links.js's
 * chips use) — so the planner doubles as a shortcut into "why", not just a
 * flat list of names.
 *
 * Renders nothing at all when every section is empty (a fresh or
 * fully-completed roster) rather than showing three empty-state messages in
 * a row.
 *
 * @param quests the full quest-data/quests.json list.
 * @param player a decorated player (data.js).
 * @param onSelectQuest (quest) => void — stats.js's own handler, shared with
 *   the quest list.
 * @param onSelectSeries (seriesName) => void — stats.js's own handler,
 *   shared with quest-series-links.js.
 */
export function renderQuestPlanner(quests, player, onSelectQuest, onSelectSeries) {
  const { readyNow, almostThere, questlines } = computeQuestPlan(quests, player);
  if (readyNow.length === 0 && almostThere.length === 0 && questlines.length === 0) return null;

  return el('section', { class: 'lb quest-plan-card' }, [
    el('div', { class: 'lb-head' }, [el('div', { class: 'lb-title' }, [el('h2', { text: 'Planner' })])]),
    el('div', { class: 'quest-plan-columns' }, [
      planSection('Ready now', 'Nothing left in the way right now — check back after a level or two.', readyNow.map((c) => readyNowItem(c, onSelectQuest))),
      planSection('Almost there', 'No quest is currently just a small stat requirement away.', almostThere.map((c) => almostThereItem(c, onSelectQuest))),
    ]),
    questlines.length > 0
      ? planSection('Questlines in progress', '', questlines.map((line) => questlineItem(line, onSelectSeries, onSelectQuest)))
      : null,
  ]);
}
