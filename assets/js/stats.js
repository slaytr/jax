/**
 * Per-player stats page entry point — the /stats/<slug>/ counterpart to
 * app.js. Each generated shell (scripts/build-stats-pages.mjs) bakes its
 * slug into `<body data-player>`, so this never has to parse
 * location.pathname (which would otherwise have to account for GitHub
 * Pages' trailing-slash redirect and the local dev server's lack of one —
 * see the build script's own notes).
 */

import { loadGroupData } from './data.js';
import { loadQuests } from './quest-data.js';
import { CALENDAR_DAY, computeLevelGains } from './compute.js';
import { initialExpansionFor } from './quest-graph.js';
import { SKILLS } from './config.js';
import { el, replaceChildren } from './dom.js';
import { renderPlayerMasthead } from './views/player-masthead.js';
import { renderPlayerGains } from './views/player-gains.js';
import { renderPlayerSkills } from './views/player-skills.js';
import { renderPlayerQuestList, SORT_OPTIONS, STATUS_OPTIONS, SKILL_OPTIONS, statusOf } from './views/player-quests.js';
import { renderQuestDependencyGraph } from './views/quest-dependency-graph.js';
import { renderGoalsList, renderGoalDialog, renderQuestGoalDialog, renderDeleteConfirmDialog, refreshGoals } from './views/player-goals.js';
import { tabToggle } from './views/tabs.js';
import { loadGoals, saveGoals } from './goals-storage.js';
import { loadGoalLabels, saveGoalLabels } from './goal-labels-storage.js';

const dom = {
  masthead: document.getElementById('masthead'),
  panel: document.getElementById('panel'),
  footer: document.getElementById('footer-meta'),
};

const PAGE_TABS = [
  ['stats', 'Stats'],
  ['quests', 'Quests'],
  ['goals', 'Goals'],
];

/**
 * Which of PAGE_TABS a viewer was last on, plus the Quests tab's own
 * search/sort/filter choices, so a refresh reopens exactly where a viewer
 * left off instead of resetting to Stats and an empty search. localStorage
 * only — a per-browser preference, best-effort like prefs.js's own
 * reads/writes (private browsing or a blocked store should never break the
 * page, just silently not remember). One shared key across every
 * /stats/<slug>/ page rather than keyed per player: this is a *reading*
 * preference ("I want Quests open, filtered to what I can start"), not
 * something tied to any one player's own data.
 *
 * Same shape as prefs.js's own jax:prefs, just a separate key — a
 * completely different set of fields, on a different page, with no reason
 * to share one blob (and every reason not to: prefs.js's own save is a
 * full overwrite, so two independent pages writing through it would each
 * clobber the other's fields).
 */
const STATS_STATE_KEY = 'jax:stats-state';

function loadStatsState() {
  try {
    const raw = localStorage.getItem(STATS_STATE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveStatsState(state) {
  try {
    localStorage.setItem(STATS_STATE_KEY, JSON.stringify(state));
  } catch {
    // Storage blocked or full — nothing to do, the page still works.
  }
}

const oneOf = (options, value, fallback) => (options.some(([option]) => option === value) ? value : fallback);

function renderNotFound(slug, groupName) {
  replaceChildren(
    dom.panel,
    el('div', { class: 'empty empty-error' }, [
      el('p', { class: 'empty-title', text: 'No such player' }),
      el('p', { class: 'empty-body', text: `"${slug}" isn't in ${groupName}'s current roster.` }),
      el('p', { class: 'empty-body' }, [el('a', { href: '../../' }, [`Back to ${groupName}`])]),
    ]),
  );
}

/** Flips one slug's membership in a Set, in place — the shared shape behind
 * both hiddenSlugs (playerToggle) and emphasizedSlugs (click-to-pin bars). */
function toggleMembership(set, slug) {
  if (set.has(slug)) set.delete(slug);
  else set.add(slug);
}

function renderFatal(message) {
  replaceChildren(
    dom.panel,
    el('div', { class: 'empty empty-error' }, [
      el('p', { class: 'empty-title', text: 'Could not load hiscore data' }),
      el('p', { class: 'empty-body', text: message }),
    ]),
  );
}

async function boot() {
  const slug = document.body.dataset.player;

  try {
    const data = await loadGroupData();
    const player = data.players.find((candidate) => candidate.slug === slug);

    document.title = `${player ? player.name : slug} · ${data.group.name} stats`;
    replaceChildren(
      dom.footer,
      el('span', { text: `Data from the RuneScape 3 hiscores, refreshed by GitHub Actions. Last fetch ${new Date(data.fetchedAt).toUTCString()}.` }),
    );

    if (!player) {
      renderNotFound(slug, data.group.name);
      return;
    }

    // The skill grid's per-cell "+N today" chips need this result's
    // per-skill breakdown, not just a rolled-up total — same source the
    // group matrix reads for the same purpose (see matrix.js's `gainFor`).
    const todayLevelGains = computeLevelGains(data.snapshots, data.players, CALENDAR_DAY);

    renderPlayerMasthead(dom.masthead, {
      player,
      groupName: data.group.name,
      fetchedAt: data.fetchedAt,
    });

    // Only the Gains section is interactive on this page (the Week/Month
    // toggle, which chart is the big active one, which players show in its
    // comparison chart, and now which single skill everything is filtered
    // to) — everything else renders once. `previousGainsWindow` mirrors
    // app.js's own previous-period tracking, driving the tab indicator's
    // slide on a click without replaying it on the very first render.
    let gainsWindow = 'week';
    let previousGainsWindow = null;
    let activeMetric = 'xp';
    let selectedSkillId = null;
    const hiddenSlugs = new Set();
    const emphasizedSlugs = new Set();

    // The Quests tab (quest-data.js) is a separate ~340KB fetch most visits
    // never need — requested on first switch to that tab (or, below, right
    // away if a persisted tab choice already opens straight onto it).
    const savedState = loadStatsState();
    let activeTab = oneOf(PAGE_TABS, savedState.tab, PAGE_TABS[0][0]);
    let previousTab = null;
    let questsState = { status: 'loading' };
    let questsRequested = false;
    let questSearch = typeof savedState.questSearch === 'string' ? savedState.questSearch : '';
    let questSort = oneOf(SORT_OPTIONS, savedState.questSort, SORT_OPTIONS[0][0]);
    let questStatusFilter = oneOf(STATUS_OPTIONS, savedState.questStatus, STATUS_OPTIONS[0][0]);
    let questSkillFilter = oneOf(SKILL_OPTIONS, savedState.questSkillReq, SKILL_OPTIONS[0][0]);
    // Which quest the dependency map beside the list is anchored on — set
    // only by clicking a list row (see render()). Nothing below is
    // persisted; all of it always starts fresh.
    let selectedQuestSlug = null;
    // Quest *names* (not slugs — quest-graph.js's own node identity)
    // currently expanded within that map, revealing their own direct
    // requirements (quest-dependency-graph.js's own "+"/"–" button).
    // Recomputed from scratch whenever a different quest is selected
    // (initialExpansionFor, quest-graph.js) rather than inheriting some
    // other chain's expansion state — every branch starts already unfolded
    // down to what this player still has left to do, not a lone collapsed
    // node.
    let expandedQuestNames = new Set();
    // Which single quest name is selected for highlighting within that same
    // map (clicking anywhere on a node besides its "+"/"–" button) — dims
    // everything outside its branch rather than changing what's expanded.
    // Fully independent of expandedQuestNames; reset alongside
    // selectedQuestSlug since a highlight from one target's chain means
    // nothing in another's.
    let highlightedQuestName = null;

    // Goals are checked against this player's skills once, right after
    // loading them — skills don't change again for the rest of the visit
    // (only a real reload pulls fresh data), so there's nothing to gain by
    // re-checking on every render. `goalDialogSkillId`/`deleteConfirmGoalId`
    // (which of the two goal dialogs is open, or null) never persist across
    // a reload, and never need resetting on a tab switch either: a native
    // <dialog> shown via showModal() makes the rest of the page inert, so
    // there's no way to reach the tab buttons while one is actually open.
    let goals = loadGoals(player.slug);
    const refreshedGoals = refreshGoals(goals, player);
    goals = refreshedGoals.goals;
    if (refreshedGoals.changed) saveGoals(player.slug, goals);
    let goalDialogSkillId = null;
    let deleteConfirmGoalId = null;
    // Which quest's "track this as a goal?" confirmation is open (the
    // dependency map's own "⚑" button, quest-dependency-graph.js) — a full
    // quest-data record, not just a name, since the dialog needs its
    // skillRequirements. Same never-persisted, dialog-owns-its-own-inertness
    // reasoning as the other two goal dialogs above.
    let questGoalDraftQuest = null;
    // Group titles currently collapsed in the Goals tab's own list
    // (renderGoalsList) — a plain in-memory Set, not persisted, same as
    // expandedQuestNames on the Quests tab: a "how I've got this arranged
    // right now" convenience, not a durable preference worth a storage key.
    let collapsedGoalGroups = new Set();

    // The label registry (name -> colour), separate from goals themselves —
    // see goal-labels-storage.js. Creating a new label from inside the "new
    // goal" dialog persists here immediately, without going through
    // render(): that dialog manages its own DOM in place (player-goals.js's
    // labelPickerField), and a full re-render here would tear it down
    // mid-pick, losing whatever labels were already added to this goal.
    let labels = loadGoalLabels(player.slug);
    // Which label the Goals tab's own list is filtered to, or 'all' — see
    // renderGoalsList's own validation of this against whichever labels
    // actually appear on a current goal (deleting the last goal that used
    // one, or the label itself, shouldn't leave the list silently empty).
    let goalLabelFilter = typeof savedState.goalLabelFilter === 'string' ? savedState.goalLabelFilter : 'all';

    function persistStatsState() {
      saveStatsState({
        tab: activeTab,
        questSearch,
        questSort,
        questStatus: questStatusFilter,
        questSkillReq: questSkillFilter,
        goalLabelFilter,
      });
    }

    function ensureQuestsLoaded() {
      if (questsRequested) return;
      questsRequested = true;
      loadQuests()
        .then((quests) => {
          questsState = { status: 'ready', quests };
          render();
        })
        .catch((error) => {
          console.error(error);
          questsState = { status: 'error', message: 'Could not load quest data.' };
          render();
        });
    }

    function render() {
      // render() rebuilds the whole panel from scratch on every state
      // change (this page's own convention — see every onSelect/onChange
      // handler below), which for a <select> or a button is invisible: the
      // new element already carries the right state. The quest search box
      // is the one control here fine-grained enough that this would show —
      // rebuilding a fresh <input> on every keystroke would otherwise drop
      // focus and the caret mid-type. Snapshot before, restore after; a
      // no-op on every render that wasn't triggered by typing in it.
      const focused = document.activeElement;
      const questSearchFocused = focused?.classList?.contains('quest-search-input');
      const questSearchCaret = questSearchFocused ? focused.selectionStart : null;

      // Resolved fresh each render (not cached in the outer state) since
      // it's derived purely from selectedSkillId — one fewer thing that
      // could drift out of sync with it.
      const selectedSkill = selectedSkillId === null ? null : SKILLS.find((skill) => skill.id === selectedSkillId);

      const tabs = tabToggle({
        tabs: PAGE_TABS,
        active: activeTab,
        previousActive: previousTab,
        ariaLabel: 'Page section',
        onSelect: (tab) => {
          previousTab = activeTab;
          activeTab = tab;
          persistStatsState();
          if (tab === 'quests') ensureQuestsLoaded();
          render();
        },
      });

      const body =
        activeTab === 'goals'
          ? el('div', { class: 'player-row' }, [
              renderPlayerSkills(player, todayLevelGains, null, (skillId) => {
                goalDialogSkillId = skillId;
                render();
              }),
              renderGoalsList(player, goals, labels, {
                labelFilter: goalLabelFilter,
                onLabelFilterChange: (value) => {
                  goalLabelFilter = value;
                  persistStatsState();
                  render();
                },
                onDeleteGoal: (goalId) => {
                  deleteConfirmGoalId = goalId;
                  render();
                },
                collapsedGroups: collapsedGoalGroups,
                onToggleGroup: (title) => {
                  const next = new Set(collapsedGoalGroups);
                  if (next.has(title)) next.delete(title);
                  else next.add(title);
                  collapsedGoalGroups = next;
                  render();
                },
              }),
            ])
          : activeTab === 'quests'
          ? (() => {
              const quests = questsState.status === 'ready' ? questsState.quests : null;
              const selectedQuest = quests?.find((quest) => quest.slug === selectedQuestSlug) ?? null;
              const onSelectQuest = (quest) => {
                // Same click-to-toggle shape as the Skills grid's own
                // cells: clicking the already-selected quest deselects it.
                const reselecting = selectedQuestSlug === quest.slug;
                selectedQuestSlug = reselecting ? null : quest.slug;
                // A newly-picked quest's map starts already unfolded down
                // to what this player still has left to do — every branch
                // expanded until (and including) the first quest they've
                // completed, rather than a lone collapsed node they'd have
                // to click their way down from scratch every time (see
                // initialExpansionFor, quest-graph.js). A deselect has
                // nothing to expand either way.
                if (reselecting || !quests) {
                  expandedQuestNames = new Set();
                } else {
                  const byName = new Map(quests.map((candidate) => [candidate.name, candidate]));
                  const completedSet = new Set(player.completedQuests ?? []);
                  const startedSet = new Set(player.startedQuests ?? []);
                  const isCompleted = (name) => {
                    const match = byName.get(name);
                    return match ? statusOf(match, completedSet, startedSet) === 'completed' : false;
                  };
                  expandedQuestNames = initialExpansionFor(quests, quest.name, isCompleted);
                }
                // A highlight from whatever was previously selected (or a
                // different target's chain entirely) means nothing here.
                highlightedQuestName = null;
                render();
              };
              const onToggleExpand = (quest) => {
                const next = new Set(expandedQuestNames);
                if (next.has(quest.name)) next.delete(quest.name);
                else next.add(quest.name);
                expandedQuestNames = next;
                render();
              };
              const onHighlightNode = (name) => {
                // Same click-to-toggle shape as everything else here:
                // clicking the already-highlighted node clears it.
                highlightedQuestName = highlightedQuestName === name ? null : name;
                render();
              };
              // Every quest name that already anchors a goal-group — hides
              // a not-started node's own "track as a goal" button once
              // there's already one, so the dialog can't be used twice on
              // the same quest and duplicate its group.
              const existingQuestGoalNames = new Set(
                goals.filter((goal) => goal.kind === 'quest').map((goal) => goal.questName),
              );

              return el('div', { class: 'player-row' }, [
                renderPlayerQuestList(
                  player,
                  questsState,
                  {
                    search: questSearch,
                    onSearchChange: (value) => {
                      questSearch = value;
                      persistStatsState();
                      render();
                    },
                    sort: questSort,
                    onSortChange: (value) => {
                      questSort = value;
                      persistStatsState();
                      render();
                    },
                    status: questStatusFilter,
                    onStatusChange: (value) => {
                      questStatusFilter = value;
                      persistStatsState();
                      render();
                    },
                    skillReq: questSkillFilter,
                    onSkillReqChange: (value) => {
                      questSkillFilter = value;
                      persistStatsState();
                      render();
                    },
                  },
                  selectedQuestSlug,
                  onSelectQuest,
                ),
                renderQuestDependencyGraph({
                  quests,
                  player,
                  targetQuest: selectedQuest,
                  expandedNames: expandedQuestNames,
                  onToggleExpand,
                  highlightedName: highlightedQuestName,
                  onHighlightNode,
                  existingQuestGoalNames,
                  onCreateQuestGoal: (quest) => {
                    questGoalDraftQuest = quest;
                    render();
                  },
                }),
              ]);
            })()
          : el('div', { class: 'player-row' }, [
              renderPlayerSkills(player, todayLevelGains, selectedSkillId, (skillId) => {
                // Clicking the already-selected cell reverts to every skill
                // combined — the same click-to-toggle shape as playerToggle
                // and the comparison chart's click-to-pin, just with only
                // one skill ever "on" at a time instead of a Set.
                selectedSkillId = selectedSkillId === skillId ? null : skillId;
                render();
              }),
              renderPlayerGains({
                player,
                players: data.players,
                snapshots: data.snapshots,
                window: gainsWindow,
                onSelectWindow: (window) => {
                  previousGainsWindow = gainsWindow;
                  gainsWindow = window;
                  render();
                },
                previousWindow: previousGainsWindow,
                activeMetric,
                onSelectMetric: (metric) => {
                  activeMetric = metric;
                  render();
                },
                hiddenSlugs,
                onToggleHidden: (slug) => {
                  toggleMembership(hiddenSlugs, slug);
                  render();
                },
                emphasizedSlugs,
                onToggleEmphasis: (slug) => {
                  toggleMembership(emphasizedSlugs, slug);
                  render();
                },
                selectedSkill,
              }),
            ]);

      // Built ahead of replaceChildren, like `tabs`/`body` above, rather
      // than appended after: a <dialog> only needs showModal() called on it
      // once it's actually in the document, done just below. None of the
      // three goal dialogs below ever open at once — each only opens from a
      // button on whichever tab is currently showing, and a native <dialog>
      // makes the rest of the page (including the tab strip) inert the
      // moment one is open — so there's no need to guard against more than
      // one being non-null together.
      const goalDialogSkill = goalDialogSkillId === null ? null : SKILLS.find((skill) => skill.id === goalDialogSkillId);
      const goalDialog = goalDialogSkill
        ? renderGoalDialog(goalDialogSkill, player, goals, labels, {
            onCreate: (draft) => {
              goals = [...goals, draft];
              saveGoals(player.slug, goals);
            },
            onClose: () => {
              goalDialogSkillId = null;
              render();
            },
            onCreateLabel: (name, colour) => {
              labels = [...labels, { name, colour }];
              saveGoalLabels(player.slug, labels);
            },
            // Deletes the label from the registry only — see
            // labelPickerField's own doc comment for why an existing
            // goal's chip is unaffected (it stores the name, not a live
            // reference into this array).
            onDeleteLabel: (name) => {
              labels = labels.filter((label) => label.name !== name);
              saveGoalLabels(player.slug, labels);
            },
          })
        : null;

      const deleteConfirmGoal = deleteConfirmGoalId === null ? null : goals.find((goal) => goal.id === deleteConfirmGoalId);
      const deleteConfirmDialog = deleteConfirmGoal
        ? renderDeleteConfirmDialog(deleteConfirmGoal, SKILLS.find((skill) => skill.id === deleteConfirmGoal.skillId), {
            onConfirm: () => {
              goals = goals.filter((goal) => goal.id !== deleteConfirmGoal.id);
              saveGoals(player.slug, goals);
            },
            onClose: () => {
              deleteConfirmGoalId = null;
              render();
            },
          })
        : null;

      const questGoalDialog = questGoalDraftQuest
        ? renderQuestGoalDialog(questGoalDraftQuest, player, {
            onConfirm: (drafts) => {
              goals = [...goals, ...drafts];
              saveGoals(player.slug, goals);
            },
            onClose: () => {
              questGoalDraftQuest = null;
              render();
            },
          })
        : null;

      replaceChildren(dom.panel, el('div', { class: 'page-tabs' }, [tabs]), body, goalDialog, deleteConfirmDialog, questGoalDialog);

      if (questSearchFocused) {
        const input = dom.panel.querySelector('.quest-search-input');
        if (input) {
          input.focus();
          if (questSearchCaret !== null) input.setSelectionRange(questSearchCaret, questSearchCaret);
        }
      }

      goalDialog?.showModal();
      deleteConfirmDialog?.showModal();
      questGoalDialog?.showModal();
    }

    if (activeTab === 'quests') ensureQuestsLoaded();
    render();
  } catch (error) {
    console.error(error);
    renderFatal(error.message);
  } finally {
    document.body.dataset.ready = 'true';
  }
}

boot();
