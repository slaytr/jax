import { el } from '../dom.js';
import { statusOf, skillLevelsByName, meetsSkillRequirements, matchesTitle } from '../quest-status.js';

// Re-exported so every existing `from './player-quests.js'` import site
// (stats.js, player-goals.js, quest-dependency-graph.js, quest-series-links.js)
// keeps working unchanged — the actual logic moved to quest-status.js so
// quest-planner.js (pure, no DOM) can use it without importing a view module.
export { statusOf, skillLevelsByName };

/**
 * `length` on a quest is qualitative and sometimes a range ("Short to
 * Medium") — see quest-data/README.md. There's nothing numeric to sort on,
 * so this pins every value the wiki currently uses to an ordinal; a value
 * outside this list (the data changed since) sorts last rather than
 * throwing.
 */
const LENGTH_ORDER = [
  'Very Short',
  'Short',
  'Short to Medium',
  'Medium',
  'Medium to Long',
  'Long',
  'Long to Very Long',
  'Very Long',
  'Very, Very Long',
];

const DIFFICULTY_ORDER = ['Novice', 'Intermediate', 'Experienced', 'Master', 'Grandmaster', 'Special'];

const rankOf = (order, value) => {
  const index = order.indexOf(value);
  return index === -1 ? Infinity : index;
};

const SORTS = {
  name: (a, b) => a.name.localeCompare(b.name),
  length: (a, b) => rankOf(LENGTH_ORDER, a.length) - rankOf(LENGTH_ORDER, b.length) || a.name.localeCompare(b.name),
  difficulty: (a, b) => rankOf(DIFFICULTY_ORDER, a.difficulty) - rankOf(DIFFICULTY_ORDER, b.difficulty) || a.name.localeCompare(b.name),
};

// Exported so stats.js can validate a persisted filter choice (localStorage
// — see loadStatsState there) against the options that actually still exist,
// rather than duplicating this list a second time.
export const SORT_OPTIONS = [
  ['name', 'Sort: A–Z'],
  ['difficulty', 'Sort: Difficulty'],
  ['length', 'Sort: Length'],
];

export const STATUS_OPTIONS = [
  ['all', 'All quests'],
  ['completed', 'Completed'],
  ['in-progress', 'In progress'],
  ['not-started', 'Not started'],
];

export const SKILL_OPTIONS = [
  ['all', 'Any skill level'],
  ['met', 'Meets skill reqs'],
  ['not-met', 'Missing skill reqs'],
];

export const STATUS_MARKER = { completed: '✓', 'in-progress': '•', 'not-started': '' };

/** The row's own name is a real `<button>` (site convention: a click target
 * is a button, not a div/li with a handler) — clicking it selects this quest
 * for the dependency map beside the list (`onSelectQuest`, stats.js), same
 * click-to-toggle shape as the Skills grid's own cells: clicking the
 * already-selected quest deselects it rather than staying stuck selected. */
function questListItem(quest, status, isSelected, onSelectQuest) {
  return el('li', { class: `quest-list-item is-${status}${isSelected ? ' is-selected' : ''}` }, [
    el('span', { class: 'quest-list-check', 'aria-hidden': 'true', text: STATUS_MARKER[status] }),
    el('button', {
      type: 'button',
      class: 'quest-list-name',
      title: `Show ${quest.name}'s dependency chain`,
      text: quest.name,
      onclick: () => onSelectQuest(quest),
    }),
  ]);
}

function filterSelect({ label, value, options, onChange }) {
  return el('label', { class: 'quest-filter' }, [
    el('span', { class: 'visually-hidden', text: label }),
    el(
      'select',
      { class: 'quest-filter-select', onchange: (event) => onChange(event.target.value) },
      options.map(([optionValue, optionLabel]) =>
        el('option', { value: optionValue, selected: optionValue === value ? true : undefined, text: optionLabel }),
      ),
    ),
  ]);
}

/** A real `<input type="search">` rather than a styled div (site
 * convention). Stats.js has to work around one consequence of the page's
 * own "replaceChildren the whole panel every render" pattern for this one:
 * rebuilding a fresh `<input>` on every keystroke would otherwise drop
 * focus and the caret mid-type — see restoreQuestSearchFocus there. */
function searchInput({ value, onChange }) {
  return el('label', { class: 'quest-filter' }, [
    el('span', { class: 'visually-hidden', text: 'Search quests by name' }),
    el('input', {
      type: 'search',
      class: 'quest-search-input',
      placeholder: 'Search quests…',
      value,
      oninput: (event) => onChange(event.target.value),
    }),
  ]);
}

function renderList(player, quests, { search, sort, status, skillReq }, selectedQuestSlug, onSelectQuest) {
  const completedSet = new Set(player.completedQuests ?? []);
  const startedSet = new Set(player.startedQuests ?? []);
  const skillLevels = skillLevelsByName(player);
  const query = search.trim().toLowerCase();

  const filtered = quests.filter((quest) => {
    if (query && !quest.name.toLowerCase().includes(query)) return false;
    if (status !== 'all' && statusOf(quest, completedSet, startedSet) !== status) return false;
    if (skillReq !== 'all' && meetsSkillRequirements(quest, skillLevels) !== (skillReq === 'met')) return false;
    return true;
  });

  if (filtered.length === 0) {
    return el('p', { class: 'chart-empty quest-list-empty', text: 'No quests match these filters.' });
  }

  return el(
    'ul',
    { class: 'quest-list' },
    filtered
      .sort(SORTS[sort] ?? SORTS.name)
      .map((quest) =>
        questListItem(quest, statusOf(quest, completedSet, startedSet), quest.slug === selectedQuestSlug, onSelectQuest),
      ),
  );
}

/** Overall progress, independent of the search box and the three filters
 * above — "how much of the game has this player done", not "how many of
 * the currently-filtered rows are done" (which would just read N/N the
 * moment the Completed filter is picked). */
function questProgressSummary(player, quests) {
  const completedSet = new Set(player.completedQuests ?? []);
  const completedCount = quests.filter((quest) => matchesTitle(quest, completedSet)).length;
  return el('p', { class: 'quest-progress', text: `Completed ${completedCount}/${quests.length}` });
}

/**
 * The Skills grid's replacement on the Quests tab — same footprint (200px
 * wide, same overall section height as Skills — see .quest-list-card in
 * styles.css) — plus a compact filter/sort toolbar above the list, since
 * that footprint no longer holds an unfiltered 385-quest list usefully.
 *
 * `questsState` is one of `{ status: 'loading' }`, `{ status: 'error',
 * message }`, or `{ status: 'ready', quests }` — fetched lazily by stats.js
 * on first switch to this tab (see quest-data.js).
 *
 * `filters` is `{ search, onSearchChange, sort, onSortChange, status,
 * onStatusChange, skillReq, onSkillReqChange }` — plain values plus their
 * setters, held in stats.js like every other piece of this page's
 * interactive state, per the pure-view-function convention every render
 * module here follows.
 *
 * A quest counts as complete/in-progress when its name matches (see
 * matchesTitle below) an entry in the player's own
 * `completedQuests`/`startedQuests` (RuneMetrics — see scripts/quests.mjs),
 * and as skill-req-met when every entry in its `skillRequirements` is at or
 * below the player's own current level for that skill (data.js's
 * skillById) — both live comparisons, not something a viewer can override.
 *
 * The "Completed X/Y" line under the list (questProgressSummary) always
 * reflects every quest, not just whatever the search/filters currently
 * show — it's a progress figure, not a result count.
 *
 * @param selectedQuestSlug whichever quest's dependency chain the map beside
 *   this list (quest-dependency-graph.js) currently shows, or null — drives
 *   `.is-selected` on that one row, same highlight convention as a selected
 *   skill-grid cell.
 * @param onSelectQuest (quest) => void — a row's name button calls this with
 *   its own quest on click (stats.js flips `selectedQuestSlug` back to null
 *   if it was already this quest, same click-to-toggle shape as the Skills
 *   grid).
 */
export function renderPlayerQuestList(player, questsState, filters, selectedQuestSlug, onSelectQuest) {
  const controls = el('div', { class: 'quest-filters' }, [
    searchInput({ value: filters.search, onChange: filters.onSearchChange }),
    filterSelect({ label: 'Sort quests by', value: filters.sort, options: SORT_OPTIONS, onChange: filters.onSortChange }),
    filterSelect({ label: 'Filter by completion status', value: filters.status, options: STATUS_OPTIONS, onChange: filters.onStatusChange }),
    filterSelect({ label: 'Filter by skill requirement', value: filters.skillReq, options: SKILL_OPTIONS, onChange: filters.onSkillReqChange }),
  ]);

  const body =
    questsState.status === 'ready'
      ? renderList(player, questsState.quests, filters, selectedQuestSlug, onSelectQuest)
      : el('p', {
          class: 'chart-empty',
          text: questsState.status === 'error' ? questsState.message : 'Loading quests…',
        });

  const summary = questsState.status === 'ready' ? questProgressSummary(player, questsState.quests) : null;

  return el('section', { class: 'lb quest-list-card' }, [
    el('div', { class: 'lb-head' }, [el('div', { class: 'lb-title' }, [el('h2', { text: 'Quests' })])]),
    controls,
    body,
    summary,
  ]);
}
