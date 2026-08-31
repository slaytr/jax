import { el, swatch } from '../dom.js';
import { formatNumber, formatCompact, formatSpan, formatRelativeTime } from '../format.js';
import { xpForLevel, levelForXp } from '../xp-table.js';
import { SKILLS, iconFor, QUEST_POINTS_ICON } from '../config.js';
import { statusOf } from './player-quests.js';
import { notMetSkillRequirements, skillValuesByName, buildQuestGoalDrafts } from '../quest-goal.js';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

const COMPLETED_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** Preset swatches for a new label, in the colour picker (renderGoalDialog)
 * — not the validated player palette (config.js), which is reserved for
 * telling players apart; this is a separate, looser set since a label is
 * plain decoration; text always carries its own name too, never colour
 * alone. `DEFAULT_LABEL_COLOUR` (== --ink-muted) is only a fallback for a
 * goal referencing a label name the registry no longer has an entry for. */
const LABEL_COLOURS = ['#0b8fa3', '#cc3346', '#199e70', '#3987e5', '#dd6296', '#d95926', '#c98500', '#8b6fd9'];
const DEFAULT_LABEL_COLOUR = '#776d5f';

/**
 * A skill goal is complete once the player's *live* skill value (data.js's
 * skillById) reaches its target — checked against level or xp depending on
 * how it was set. A quest goal (`kind: 'quest'`, see quest-goal.js) is
 * complete once its `questName` matches an entry in the player's own
 * RuneMetrics completed list (statusOf, player-quests.js — the exact same
 * title-matching the Quests tab's own list and the dependency map use, so a
 * goal and the map agree on when a quest counts as done).
 *
 * Either way this only runs when someone actually loads the page, not
 * continuously in the background (there's no server here to watch for it),
 * so `completedAt` really means "first noticed complete on a visit", not
 * the exact in-game moment — close enough for a personal tracker, but worth
 * knowing if a duration ever looks a little longer than expected.
 */
function checkCompletion(goal, player) {
  if (goal.completedAt) return goal;

  if (goal.kind === 'quest') {
    const completedSet = new Set(player.completedQuests ?? []);
    const startedSet = new Set(player.startedQuests ?? []);
    if (statusOf({ name: goal.questName }, completedSet, startedSet) !== 'completed') return goal;
    return { ...goal, completedAt: new Date().toISOString() };
  }

  const value = player.skillById?.[goal.skillId];
  if (!value) return goal;

  const reached = goal.targetType === 'level' ? value.level >= goal.targetValue : value.xp >= goal.targetValue;
  if (!reached) return goal;

  return { ...goal, completedAt: new Date().toISOString(), completedLevel: value.level, completedXp: value.xp };
}

/** A `kind: 'skill'` goal whose `skillId` doesn't resolve to any current
 * SKILLS entry can't be rendered (activeSkillGoalCard/completedSkillGoalCard
 * both need the real skill for its name and icon — iconFor would throw on
 * undefined) — dropped here rather than crashing every future render. The
 * only way to reach this today is a quest-goal draft built before
 * quest-goal.js's notMetSkillRequirements started excluding the "quest
 * points" pseudo-skill requirement; kept as a general safety net rather than
 * a one-off migration, since any other future cause of a dangling skillId
 * should self-heal the same way instead of needing its own cleanup pass. */
const isRenderable = (goal) => goal.kind === 'quest' || SKILLS.some((skill) => skill.id === goal.skillId);

/**
 * Re-checks every goal against the player's current skills, and drops any
 * that can no longer be rendered at all (isRenderable). Returns a new array
 * (goals that didn't change are the same object, so a caller can still tell
 * *which* changed if it ever needs to) plus whether anything actually
 * changed — either a completion or a drop — stats.js only needs to persist
 * when it did.
 */
export function refreshGoals(goals, player) {
  let changed = false;
  const renderable = goals.filter(isRenderable);
  if (renderable.length !== goals.length) changed = true;

  const next = renderable.map((goal) => {
    const updated = checkCompletion(goal, player);
    if (updated !== goal) changed = true;
    return updated;
  });
  return { goals: next, changed };
}

const startValueOf = (goal) => (goal.targetType === 'level' ? goal.startLevel : goal.startXp);

function progressFraction(goal, currentValue) {
  const span = goal.targetValue - startValueOf(goal);
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (currentValue - startValueOf(goal)) / span));
}

const goalTargetLabel = (goal) => (goal.targetType === 'level' ? `Level ${formatNumber(goal.targetValue)}` : `${formatNumber(goal.targetValue)} xp`);

/** Every distinct non-empty value of `field` across `goals`, alphabetised —
 * the group datalist in renderGoalDialog and the group headings in
 * renderGoalsList both read off this. There's no separate "list of groups"
 * kept anywhere: a group exists exactly as long as some goal still
 * references it, and stops suggesting itself the moment the last goal
 * using it is deleted — no separate cleanup needed. (Labels used to work
 * the same way; now that a label carries its own colour, it's tracked in
 * its own registry instead — see goal-labels-storage.js.) */
const distinctValues = (goals, field) => [...new Set(goals.map((goal) => goal[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b));

/** Intersperses a " · " separator between meta-line segments, so the card
 * builders below just list what they want shown rather than each hand-
 * writing the joins. */
function metaLine(parts) {
  return el(
    'p',
    { class: 'goal-card-meta' },
    parts.flatMap((text, index) => [
      index > 0 ? el('span', { 'aria-hidden': 'true', text: ' · ' }) : null,
      el('span', { text }),
    ]),
  );
}

function deleteButton(goal, onDelete) {
  return el('button', {
    type: 'button',
    class: 'goal-card-delete',
    'aria-label': 'Delete this goal',
    onclick: () => onDelete(goal.id),
    text: '×',
  });
}

/** The one place a goal's labels actually show — its group, by contrast,
 * only ever shows as the heading of whichever section it sorts the goal
 * into (renderGoalsList); there's no per-card group chip to keep the two
 * distinct. `labelsByName` is this player's label registry (a Map of name
 * -> colour) — see loadGoalLabels/goal-labels-storage.js — so a chip always
 * paints in the colour the label was actually created with, not whatever
 * this one goal happened to see at the time. Returns null (no row at all)
 * for a goal with no labels, same as an empty children array anywhere else
 * in this file. */
function labelChips(goal, labelsByName) {
  const names = goal.labels ?? [];
  if (names.length === 0) return null;

  return el(
    'div',
    { class: 'goal-card-labels' },
    names.map((name) =>
      el('span', { class: 'goal-card-label' }, [
        swatch(labelsByName.get(name) ?? DEFAULT_LABEL_COLOUR),
        el('span', { class: 'goal-card-label-name', text: name }),
      ]),
    ),
  );
}

function activeSkillGoalCard(goal, skill, player, labelsByName, onDelete) {
  const value = player.skillById?.[goal.skillId];
  const currentValue = goal.targetType === 'level' ? (value?.level ?? goal.startLevel) : (value?.xp ?? goal.startXp);
  const fraction = progressFraction(goal, currentValue);
  const currentLabel = goal.targetType === 'level' ? 'Current Level' : 'Current XP';

  return el('li', { class: 'goal-card' }, [
    el('div', { class: 'goal-card-head' }, [
      el('img', { class: 'goal-card-icon', src: iconFor(skill), alt: '', width: 18, height: 18, decoding: 'async' }),
      el('span', { class: 'goal-card-name', text: skill.name }),
      el('span', { class: 'goal-card-current', text: `${currentLabel}: ${formatNumber(currentValue)}` }),
      el('span', { class: 'goal-card-head-spacer' }),
      el('span', { class: 'goal-card-target', text: goalTargetLabel(goal) }),
      deleteButton(goal, onDelete),
    ]),
    labelChips(goal, labelsByName),
    el('div', { class: 'goal-progress-row' }, [
      el('div', { class: 'goal-progress-track', role: 'presentation' }, [
        el('span', { class: 'goal-progress-fill', style: { width: `${(fraction * 100).toFixed(1)}%` } }),
      ]),
      el('span', { class: 'goal-progress-percent', text: `${Math.round(fraction * 100)}%` }),
    ]),
    metaLine([`Started ${formatRelativeTime(goal.startedAt)}`]),
  ]);
}

/**
 * `ratePerDay` floors its elapsed time at one hour — a goal completed
 * within minutes of being set (two visits close together, or a big xp
 * lamp/reward landing right after) would otherwise divide by a near-zero
 * span and report an absurd rate rather than just a fast one.
 */
function completedSkillGoalCard(goal, skill, labelsByName, onDelete) {
  const startedMs = Date.parse(goal.startedAt);
  const completedMs = Date.parse(goal.completedAt);
  const levelsGained = (goal.completedLevel ?? goal.startLevel) - goal.startLevel;
  const xpGained = (goal.completedXp ?? goal.startXp) - goal.startXp;
  const days = Math.max((completedMs - startedMs) / 86400000, 1 / 24);
  const ratePerDay = xpGained / days;

  return el('li', { class: 'goal-card is-complete' }, [
    el('div', { class: 'goal-card-head' }, [
      el('img', { class: 'goal-card-icon', src: iconFor(skill), alt: '', width: 18, height: 18, decoding: 'async' }),
      el('span', { class: 'goal-card-name', text: skill.name }),
      el('span', { class: 'goal-card-target', text: `✓ ${goalTargetLabel(goal)}` }),
      deleteButton(goal, onDelete),
    ]),
    labelChips(goal, labelsByName),
    metaLine([
      `Completed ${COMPLETED_DATE.format(new Date(completedMs))}`,
      `+${formatNumber(levelsGained)} level${levelsGained === 1 ? '' : 's'}`,
      `+${formatNumber(xpGained)} xp`,
      `Took ${formatSpan(completedMs - startedMs)}`,
      `${formatCompact(ratePerDay)} xp/day avg`,
    ]),
  ]);
}

/** A quest goal (kind: 'quest', quest-goal.js) has no incremental progress
 * to bar-chart the way a skill goal's level/xp does — RuneMetrics only ever
 * reports coarse not-started/in-progress/completed — so its active card
 * shows that live status as plain text instead. `player.completedQuests`/
 * `startedQuests` are re-read here rather than passed a pre-computed
 * status: this card isn't the thing that decides completion (checkCompletion
 * already did, via the very same statusOf call), it's just describing where
 * things stand for a goal that hasn't tipped over into complete yet. */
function activeQuestGoalCard(goal, player, labelsByName, onDelete) {
  const completedSet = new Set(player.completedQuests ?? []);
  const startedSet = new Set(player.startedQuests ?? []);
  const status = statusOf({ name: goal.questName }, completedSet, startedSet);

  return el('li', { class: 'goal-card' }, [
    el('div', { class: 'goal-card-head' }, [
      el('img', { class: 'goal-card-icon', src: QUEST_POINTS_ICON, alt: '', width: 18, height: 18, decoding: 'async' }),
      el('span', { class: 'goal-card-name', text: goal.questName }),
      el('span', { class: 'goal-card-current', text: status === 'in-progress' ? 'In progress' : 'Not started' }),
      el('span', { class: 'goal-card-head-spacer' }),
      deleteButton(goal, onDelete),
    ]),
    labelChips(goal, labelsByName),
    metaLine([`Started ${formatRelativeTime(goal.startedAt)}`]),
  ]);
}

function completedQuestGoalCard(goal, labelsByName, onDelete) {
  return el('li', { class: 'goal-card is-complete' }, [
    el('div', { class: 'goal-card-head' }, [
      el('img', { class: 'goal-card-icon', src: QUEST_POINTS_ICON, alt: '', width: 18, height: 18, decoding: 'async' }),
      el('span', { class: 'goal-card-name', text: goal.questName }),
      el('span', { class: 'goal-card-target', text: '✓ Completed' }),
      deleteButton(goal, onDelete),
    ]),
    labelChips(goal, labelsByName),
    metaLine([
      `Completed ${COMPLETED_DATE.format(new Date(goal.completedAt))}`,
      `Took ${formatSpan(Date.parse(goal.completedAt) - Date.parse(goal.startedAt))}`,
    ]),
  ]);
}

function goalCard(goal, bySkillId, player, labelsByName, onDelete) {
  if (goal.kind === 'quest') {
    return goal.completedAt ? completedQuestGoalCard(goal, labelsByName, onDelete) : activeQuestGoalCard(goal, player, labelsByName, onDelete);
  }
  const skill = bySkillId.get(goal.skillId);
  return goal.completedAt
    ? completedSkillGoalCard(goal, skill, labelsByName, onDelete)
    : activeSkillGoalCard(goal, skill, player, labelsByName, onDelete);
}

/** Active ones first (creation order), completed ones shuffled to the
 * bottom (most recently finished first) rather than mixed in, so the
 * still-in-progress goals a viewer actually cares about stay on top — same
 * ordering renderGoalsList used before groups existed, just now scoped to
 * one group's goals at a time instead of the whole list. Skill and quest
 * goals (goalCard) sort and mix freely within that — a quest-derived group
 * (quest-goal.js) typically holds one of each. */
function goalListItems(sectionGoals, bySkillId, player, labelsByName, onDeleteGoal) {
  const active = sectionGoals.filter((goal) => !goal.completedAt);
  const completed = sectionGoals.filter((goal) => goal.completedAt).sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt));
  return [...active, ...completed].map((goal) => goalCard(goal, bySkillId, player, labelsByName, onDeleteGoal));
}

/**
 * Splits `goals` into one section per group, alphabetised, plus a final
 * catch-all for goals with no group — titled "Ungrouped" only when there's
 * at least one *named* group to actually distinguish it from (a viewer who
 * has never grouped anything just gets one flat, heading-less list, exactly
 * like before groups existed).
 */
function goalSections(goals) {
  const groupNames = distinctValues(goals, 'group');
  const sections = groupNames.map((name) => ({ title: name, goals: goals.filter((goal) => goal.group === name) }));

  const ungrouped = goals.filter((goal) => !goal.group);
  if (ungrouped.length > 0) sections.push({ title: groupNames.length > 0 ? 'Ungrouped' : null, goals: ungrouped });

  return sections;
}

/** Every distinct label name actually used by at least one of `goals`,
 * alphabetised — the filter dropdown below reads off this, not the full
 * label registry, so it only ever offers something narrowing the list down
 * actually does something (a registered-but-unused label would just filter
 * to an empty list). */
const distinctLabelNames = (goals) => [...new Set(goals.flatMap((goal) => goal.labels ?? []))].sort((a, b) => a.localeCompare(b));

/** Distinct label names in most-recently-used order — the most recently
 * *started* goal's own labels first, then the next goal's (skipping names
 * already seen), and so on. Fed to the "new goal" dialog's label picker
 * (labelPickerField) so it can show a handful of likely picks immediately,
 * before a viewer has typed anything — there's no separate "last used"
 * timestamp kept per label; a goal's own startedAt is enough. */
const recentLabelNames = (goals) => {
  const byRecency = [...goals].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  return [...new Set(byRecency.flatMap((goal) => goal.labels ?? []))];
};

function labelFilterSelect({ value, options, onChange }) {
  return el('label', { class: 'goal-filter' }, [
    el('span', { class: 'visually-hidden', text: 'Filter goals by label' }),
    el(
      'select',
      { class: 'goal-filter-select', onchange: (event) => onChange(event.target.value) },
      [
        el('option', { value: 'all', selected: value === 'all' ? true : undefined, text: 'All labels' }),
        ...options.map((name) => el('option', { value: name, selected: value === name ? true : undefined, text: name })),
      ],
    ),
  ]);
}

/**
 * The Goals tab's second column — every goal this browser has set for
 * `player`, segmented into one visual block per group (goalSections above)
 * so a viewer with several goals going at once can tell them apart at a
 * glance; within each block, active-then-completed ordering still applies
 * (goalListItems).
 *
 * `goals` is already up to date (stats.js runs refreshGoals before every
 * render) — this module only renders, it never decides completion itself.
 * `labels` is this player's label registry (goal-labels-storage.js),
 * turned into a name -> colour Map once here rather than in every card.
 *
 * `filters` is `{ labelFilter, onLabelFilterChange, onDeleteGoal,
 * collapsedGroups, onToggleGroup }` — a label name or 'all' plus its setter,
 * held in stats.js like every other piece of this page's interactive state.
 * The filter select only appears once there's at least one label actually in
 * use (distinctLabelNames) — nothing to filter by otherwise. A `labelFilter`
 * that no longer matches any current goal (its last goal, or the label
 * itself, got deleted) falls back to 'all' rather than silently showing an
 * empty list forever.
 *
 * `collapsedGroups` is a `Set` of group titles currently collapsed to just
 * their heading (its own goals hidden, not removed) — only a *named* group
 * gets the toggle at all; the title-less catch-all section (every goal with
 * no group, when nothing else is grouped either) has nothing to collapse
 * against, same reasoning as it having no heading to click in the first
 * place. `onToggleGroup(title)` flips one name's membership.
 */
export function renderGoalsList(player, goals, labels, { labelFilter, onLabelFilterChange, onDeleteGoal, collapsedGroups, onToggleGroup }) {
  const bySkillId = new Map(SKILLS.map((skill) => [skill.id, skill]));
  const labelsByName = new Map(labels.map((label) => [label.name, label.colour]));

  const usedLabelNames = distinctLabelNames(goals);
  const effectiveFilter = usedLabelNames.includes(labelFilter) ? labelFilter : 'all';
  const filterControl =
    usedLabelNames.length > 0
      ? el('div', { class: 'goal-filters' }, [
          labelFilterSelect({ value: effectiveFilter, options: usedLabelNames, onChange: onLabelFilterChange }),
        ])
      : null;

  const filteredGoals =
    effectiveFilter === 'all' ? goals : goals.filter((goal) => (goal.labels ?? []).includes(effectiveFilter));

  const body =
    filteredGoals.length === 0
      ? el('p', {
          class: 'chart-empty',
          text: goals.length === 0 ? 'No goals yet — click a skill to set one.' : 'No goals match this label.',
        })
      : goalSections(filteredGoals).map((section) => {
          const collapsed = section.title !== null && collapsedGroups.has(section.title);
          return el('div', { class: `goal-group${collapsed ? ' is-collapsed' : ''}` }, [
            section.title
              ? el(
                  'button',
                  {
                    type: 'button',
                    class: 'goal-group-title',
                    'aria-expanded': collapsed ? 'false' : 'true',
                    onclick: () => onToggleGroup(section.title),
                  },
                  [
                    el('span', { class: 'goal-group-chevron', 'aria-hidden': 'true' }),
                    el('span', { class: 'goal-group-name', text: section.title }),
                    el('span', { class: 'goal-group-count', text: String(section.goals.length) }),
                  ],
                )
              : null,
            collapsed ? null : el('ul', { class: 'goals-list' }, goalListItems(section.goals, bySkillId, player, labelsByName, onDeleteGoal)),
          ]);
        });

  return el('section', { class: 'lb', style: { '--accent': player.colour } }, [
    el('div', { class: 'lb-head' }, [el('div', { class: 'lb-title' }, [el('h2', { text: 'Goals' })])]),
    filterControl,
    body,
  ]);
}

/**
 * The label picker inside the "new goal" dialog — a search-and-select box
 * (type to filter the known-labels dropdown, click one to add it) that can
 * also create a brand new label on the spot (an unmatched query offers
 * "+ Create '…'", which then asks for a colour from LABEL_COLOURS before
 * adding it). Multiple labels can be added to the one goal being created;
 * each shows as a removable chip below the search box.
 *
 * This manages its own DOM in place (rebuilding just its dropdown/chip
 * rows on each interaction) rather than going through the page's usual
 * "re-render the whole panel" cycle (stats.js's render()) — that cycle
 * would tear down and rebuild this exact dialog on every keystroke or
 * selection, losing whatever was picked so far. The only things that have
 * to escape this closure are `onCreateLabel`/`onDeleteLabel(name)`, so
 * stats.js can persist a registry change immediately (independent of
 * whether this goal ends up being saved) — see their call sites for why
 * that persist doesn't trigger a re-render either.
 *
 * Each dropdown row's own × deletes that label from the registry entirely
 * (knownLabels here, and stats.js's own copy via onDeleteLabel) — it stops
 * being offered as a quick-select from this point on, anywhere, but never
 * touches any goal that already carries it (a goal only stores label
 * *names*; renderGoalsList falls back to DEFAULT_LABEL_COLOUR for a name
 * the registry no longer recognises, rather than dropping the chip). A
 * label already added to *this* in-progress goal (`selected`) stays added
 * even if deleted from the registry the same way — deleting a suggestion
 * shouldn't retroactively un-pick something already chosen.
 *
 * `recentNames` (renderGoalDialog's own recentLabelNames) shows up front,
 * before the search box has been touched at all — renderRecent, not
 * renderDropdown, populates the dropdown on first paint, so a viewer who
 * reaches for the same handful of labels every time doesn't have to click
 * in and start typing just to see them.
 *
 * Returns `{ node, getSelectedLabels }`: `node` goes in the form,
 * `getSelectedLabels()` is read once, at submit time, by the caller.
 */
const RECENT_LABEL_LIMIT = 5;

function labelPickerField(initialLabels, recentNames, onCreateLabel, onDeleteLabel) {
  let knownLabels = [...initialLabels]; // { name, colour }[] — grows in place as new ones are created this session
  let selected = []; // string[] — this goal's labels so far
  let creatingName = null;

  const searchInput = el('input', { type: 'text', class: 'goal-label-search', placeholder: 'Search or create a label…' });
  const dropdown = el('ul', { class: 'goal-label-dropdown' });
  const colourPicker = el('div', { class: 'goal-label-colours', hidden: true });
  const chips = el('div', { class: 'goal-label-chips' });

  const colourOf = (name) => knownLabels.find((label) => label.name === name)?.colour ?? DEFAULT_LABEL_COLOUR;

  function renderChips() {
    chips.replaceChildren(
      ...selected.map((name) =>
        el('span', { class: 'goal-label-chip' }, [
          swatch(colourOf(name)),
          el('span', { text: name }),
          el('button', {
            type: 'button',
            'aria-label': `Remove the ${name} label`,
            onclick: () => {
              selected = selected.filter((selectedName) => selectedName !== name);
              renderChips();
              renderDropdown();
            },
            text: '×',
          }),
        ]),
      ),
    );
  }

  function labelRow(label) {
    return el('li', { class: 'goal-label-row' }, [
      el('button', { type: 'button', class: 'goal-label-option', onclick: () => selectLabel(label.name) }, [
        swatch(label.colour),
        el('span', { text: label.name }),
      ]),
      el('button', {
        type: 'button',
        class: 'goal-label-row-delete',
        'aria-label': `Delete the ${label.name} label`,
        onclick: () => deleteLabel(label.name),
        text: '×',
      }),
    ]);
  }

  /** Shown once, before any interaction — see the doc comment above. */
  function renderRecent() {
    const rows = recentNames
      .map((name) => knownLabels.find((label) => label.name === name))
      .filter((label) => label && !selected.includes(label.name))
      .slice(0, RECENT_LABEL_LIMIT);

    dropdown.replaceChildren(...rows.map(labelRow));
    dropdown.hidden = rows.length === 0;
  }

  function renderDropdown() {
    const query = searchInput.value.trim();
    const matches = knownLabels.filter(
      (label) => !selected.includes(label.name) && label.name.toLowerCase().includes(query.toLowerCase()),
    );
    const exactMatch = knownLabels.some((label) => label.name.toLowerCase() === query.toLowerCase());

    const options = matches.map(labelRow);

    if (query && !exactMatch) {
      options.push(
        el('li', { class: 'goal-label-row' }, [
          el(
            'button',
            { type: 'button', class: 'goal-label-option goal-label-create', onclick: () => startCreating(query) },
            [`+ Create "${query}"`],
          ),
        ]),
      );
    }

    dropdown.replaceChildren(...options);
    dropdown.hidden = options.length === 0;
    colourPicker.hidden = true;
  }

  function selectLabel(name) {
    if (!selected.includes(name)) selected = [...selected, name];
    creatingName = null;
    searchInput.value = '';
    searchInput.focus();
    renderChips();
    renderDropdown();
  }

  function startCreating(name) {
    creatingName = name;
    dropdown.hidden = true;
    colourPicker.hidden = false;
  }

  function deleteLabel(name) {
    knownLabels = knownLabels.filter((label) => label.name !== name);
    onDeleteLabel(name);
    renderDropdown();
  }

  colourPicker.append(
    ...LABEL_COLOURS.map((colour) =>
      el('button', {
        type: 'button',
        class: 'goal-label-swatch',
        style: { '--swatch': colour },
        'aria-label': `Use ${colour}`,
        onclick: () => {
          const name = creatingName;
          if (!name) return;
          knownLabels = [...knownLabels, { name, colour }];
          onCreateLabel(name, colour);
          selectLabel(name);
        },
      }),
    ),
  );

  searchInput.addEventListener('input', renderDropdown);
  searchInput.addEventListener('focus', renderDropdown);

  renderChips();
  renderRecent();

  return {
    node: el('div', { class: 'goal-label-field' }, [searchInput, dropdown, colourPicker, chips]),
    getSelectedLabels: () => selected,
  };
}

/**
 * The "set a goal" dialog a skill-grid click opens (stats.js wires the
 * grid's onSelect to this). A real `<dialog>` — native focus trap, Escape
 * to dismiss, and a backdrop for free, none of which this codebase has had
 * to build before now.
 *
 * `onCreate(goalDraft)` fires once, on a valid submit, before the dialog
 * closes itself; `onClose()` fires from the dialog's own native `close`
 * event, which covers Cancel, Escape, *and* the close a successful submit
 * triggers — one place for stats.js to clear its "which dialog is open"
 * state and re-render, regardless of how the dialog actually closed.
 *
 * A maxed skill (already at its level cap) starts on the XP radio with the
 * Level one disabled — there's no next level left to set a goal against.
 *
 * No group field here for now — a goal is always created with `group:
 * null` — but the concept stays fully wired up everywhere else
 * (goalSections/renderGoalsList's section-per-group display, the `group`
 * field itself) for whenever this dialog picks it back up. `labels` is the
 * label registry (goal-labels-storage.js); `goals` only feeds
 * recentLabelNames, for the label picker's initial suggestions.
 * `onCreateLabel`/`onDeleteLabel` are threaded straight through to it.
 */
export function renderGoalDialog(skill, player, goals, labels, { onCreate, onClose, onCreateLabel, onDeleteLabel }) {
  const value = player.skillById?.[skill.id] ?? { level: 1, xp: 0 };
  const maxed = value.level >= skill.max;
  const nextLevel = Math.min(value.level + 1, skill.max);
  const nextLevelXp = xpForLevel(skill, nextLevel);

  const levelInput = el('input', {
    type: 'number',
    min: value.level + 1,
    max: skill.max,
    step: 1,
    value: maxed ? skill.max : nextLevel,
  });
  const xpInput = el('input', {
    type: 'number',
    min: value.xp + 1,
    step: 1,
    value: nextLevelXp ?? value.xp + 100000,
  });

  const levelRadio = el('input', {
    type: 'radio',
    name: 'goal-target-type',
    checked: maxed ? undefined : true,
    disabled: maxed ? true : undefined,
  });
  const xpRadio = el('input', { type: 'radio', name: 'goal-target-type', checked: maxed ? true : undefined });

  const syncEnabled = () => {
    levelInput.disabled = !levelRadio.checked;
    xpInput.disabled = !xpRadio.checked;
  };
  levelRadio.addEventListener('change', syncEnabled);
  xpRadio.addEventListener('change', syncEnabled);
  syncEnabled();

  // Editing either field updates the other to match, via the shared xp
  // table (xp-table.js) — so whichever one the radio doesn't currently
  // point at still reflects a real, consistent value if the viewer flips
  // back to it, rather than some stale default from when the dialog opened.
  levelInput.addEventListener('input', () => {
    const level = Math.trunc(Number(levelInput.value));
    if (!Number.isFinite(level) || level < 1) return;
    const xp = xpForLevel(skill, Math.min(level, skill.max));
    if (xp !== undefined) xpInput.value = xp;
  });

  xpInput.addEventListener('input', () => {
    const xp = Number(xpInput.value);
    if (!Number.isFinite(xp) || xp < 0) return;
    levelInput.value = levelForXp(skill, xp);
  });

  const errorText = el('p', { class: 'goal-dialog-error', hidden: true });

  const labelPicker = labelPickerField(labels, recentLabelNames(goals), onCreateLabel, onDeleteLabel);

  const form = el('form', { class: 'goal-form' }, [
    el('h3', { class: 'goal-dialog-title', text: `New ${skill.name} goal` }),
    el('p', { class: 'goal-dialog-current', text: `Currently level ${formatNumber(value.level)} (${formatNumber(value.xp)} xp)` }),
    el('label', { class: 'goal-target-choice' }, [levelRadio, el('span', { text: 'Level' }), levelInput]),
    el('label', { class: 'goal-target-choice' }, [xpRadio, el('span', { text: 'XP' }), xpInput]),
    el('div', { class: 'goal-text-field goal-text-field-labels' }, [el('span', { text: 'Labels' }), labelPicker.node]),
    errorText,
    el('div', { class: 'goal-dialog-actions' }, [
      el('button', { type: 'button', class: 'goal-btn', text: 'Cancel', onclick: () => dialog.close() }),
      el('button', { type: 'submit', class: 'goal-btn goal-btn-primary', text: 'Add goal' }),
    ]),
  ]);

  const dialog = el('dialog', { class: 'goal-dialog' }, [form]);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const useXp = xpRadio.checked;
    const raw = Number(useXp ? xpInput.value : levelInput.value);
    const min = useXp ? value.xp + 1 : value.level + 1;

    if (!Number.isFinite(raw) || raw < min) {
      errorText.textContent = useXp
        ? `Enter an xp target above ${formatNumber(value.xp)}.`
        : `Enter a level above ${formatNumber(value.level)}.`;
      errorText.hidden = false;
      return;
    }

    onCreate({
      id: uid(),
      skillId: skill.id,
      targetType: useXp ? 'xp' : 'level',
      targetValue: Math.trunc(raw),
      // Not settable from this dialog for now — the group concept (and
      // renderGoalsList's own section-per-group display) stays fully wired
      // up for whatever existing/future goal actually carries one, there's
      // just no UI to assign one from here yet.
      group: null,
      labels: labelPicker.getSelectedLabels(),
      startLevel: value.level,
      startXp: value.xp,
      startedAt: new Date().toISOString(),
      completedAt: null,
      completedLevel: null,
      completedXp: null,
    });
    dialog.close();
  });

  dialog.addEventListener('close', onClose);

  return dialog;
}

/**
 * The "delete this goal?" confirmation a goal card's × opens (stats.js
 * wires it up, same shape as renderGoalDialog above: `onConfirm()` fires
 * once on a real confirm, before the dialog closes itself; `onClose()`
 * fires from the dialog's own native `close` event, covering Cancel,
 * Escape, and the close a confirm triggers alike). A completed goal shows
 * its outcome figures too, not just the target — deleting one throws away
 * a real record (when it finished, how long it took), not just an
 * in-progress tracker, so it's worth a clearer look before confirming.
 *
 * `skill` is only meaningful for a `kind: 'skill'` goal (stats.js looks it
 * up by the goal's own skillId) — a quest goal has none, and this reads
 * `goal.questName` instead whenever `skill` is absent.
 */
export function renderDeleteConfirmDialog(goal, skill, { onConfirm, onClose }) {
  const name = skill ? skill.name : goal.questName;
  const target = skill ? goalTargetLabel(goal) : 'Quest completion';
  const summary = goal.completedAt
    ? `${name} — ✓ ${target}, completed ${COMPLETED_DATE.format(new Date(goal.completedAt))}`
    : `${name} — ${target}`;

  const dialog = el('dialog', { class: 'goal-dialog goal-confirm-dialog' }, [
    el('div', { class: 'goal-form' }, [
      el('h3', { class: 'goal-dialog-title', text: 'Delete this goal?' }),
      el('p', { class: 'goal-dialog-current', text: summary }),
      el('div', { class: 'goal-dialog-actions' }, [
        el('button', { type: 'button', class: 'goal-btn', text: 'Cancel', onclick: () => dialog.close() }),
        el('button', {
          type: 'button',
          class: 'goal-btn goal-btn-danger',
          text: 'Delete',
          onclick: () => {
            onConfirm();
            dialog.close();
          },
        }),
      ]),
    ]),
  ]);

  dialog.addEventListener('close', onClose);

  return dialog;
}

/**
 * The "track this quest as a goal?" confirmation the dependency map's own
 * per-node "add goal" button opens (quest-dependency-graph.js, not-started
 * quests only). Same shape as the other two dialogs in this file:
 * `onConfirm(drafts)` fires once, with the full array buildQuestGoalDrafts
 * built (the quest itself plus one skill goal per not-yet-met requirement),
 * before the dialog closes itself; `onClose()` fires from the dialog's own
 * native `close` event either way.
 *
 * Every draft this creates shares one `group` (the quest's own name — see
 * quest-goal.js), so accepting always adds exactly one new section to the
 * Goals tab, never merges into an existing one — a skill goal already
 * tracked separately for the same skill is left alone; this doesn't check
 * for or reuse it.
 */
export function renderQuestGoalDialog(quest, player, { onConfirm, onClose }) {
  const skillValues = skillValuesByName(player);
  const skillLevels = new Map([...skillValues].map(([name, value]) => [name, value.level]));
  const notMet = notMetSkillRequirements(quest, skillLevels);

  const summary =
    notMet.length === 0
      ? `Adds one goal, tracking the quest itself.`
      : `Adds ${notMet.length + 1} goals: the quest itself, plus a skill goal for each requirement below.`;

  const requirementList =
    notMet.length === 0
      ? null
      : el(
          'ul',
          { class: 'quest-goal-dialog-reqs' },
          notMet.map((req) => {
            const skill = SKILLS.find((candidate) => candidate.name === req.skill);
            return el('li', { class: 'quest-goal-dialog-req' }, [
              skill ? el('img', { src: iconFor(skill), alt: '', width: 14, height: 14, decoding: 'async' }) : null,
              el('span', { text: `${req.skill} ${req.level}` }),
            ]);
          }),
        );

  const dialog = el('dialog', { class: 'goal-dialog goal-confirm-dialog' }, [
    el('div', { class: 'goal-form' }, [
      el('h3', { class: 'goal-dialog-title', text: `Track "${quest.name}" as a goal?` }),
      el('p', { class: 'goal-dialog-current', text: summary }),
      requirementList,
      el('div', { class: 'goal-dialog-actions' }, [
        el('button', { type: 'button', class: 'goal-btn', text: 'Cancel', onclick: () => dialog.close() }),
        el('button', {
          type: 'button',
          class: 'goal-btn goal-btn-primary',
          text: 'Add goals',
          onclick: () => {
            onConfirm(buildQuestGoalDrafts(quest, skillLevels, skillValues));
            dialog.close();
          },
        }),
      ]),
    ]),
  ]);

  dialog.addEventListener('close', onClose);

  return dialog;
}
