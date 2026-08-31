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
import { SKILLS } from './config.js';
import { el, replaceChildren } from './dom.js';
import { renderPlayerMasthead } from './views/player-masthead.js';
import { renderPlayerGains } from './views/player-gains.js';
import { renderPlayerSkills } from './views/player-skills.js';
import {
  renderPlayerQuestList,
  renderQuestFlowchartPlaceholder,
  SORT_OPTIONS,
  STATUS_OPTIONS,
  SKILL_OPTIONS,
} from './views/player-quests.js';
import { renderGoalsList, renderGoalDialog, refreshGoals } from './views/player-goals.js';
import { tabToggle } from './views/tabs.js';
import { loadGoals, saveGoals } from './goals-storage.js';

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

    // Goals are checked against this player's skills once, right after
    // loading them — skills don't change again for the rest of the visit
    // (only a real reload pulls fresh data), so there's nothing to gain by
    // re-checking on every render. `goalDialogSkillId` (which skill's "new
    // goal" dialog is open, or null) never persists across a reload, and
    // never needs resetting on a tab switch either: a native <dialog> shown
    // via showModal() makes the rest of the page inert, so there's no way
    // to reach the tab buttons while one is actually open.
    let goals = loadGoals(player.slug);
    const refreshedGoals = refreshGoals(goals, player);
    goals = refreshedGoals.goals;
    if (refreshedGoals.changed) saveGoals(player.slug, goals);
    let goalDialogSkillId = null;

    function persistStatsState() {
      saveStatsState({
        tab: activeTab,
        questSearch,
        questSort,
        questStatus: questStatusFilter,
        questSkillReq: questSkillFilter,
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
              renderGoalsList(player, goals, (goalId) => {
                goals = goals.filter((goal) => goal.id !== goalId);
                saveGoals(player.slug, goals);
                render();
              }),
            ])
          : activeTab === 'quests'
          ? el('div', { class: 'player-row' }, [
              renderPlayerQuestList(player, questsState, {
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
              }),
              renderQuestFlowchartPlaceholder(),
            ])
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
      // once it's actually in the document, done just below.
      const goalDialogSkill = goalDialogSkillId === null ? null : SKILLS.find((skill) => skill.id === goalDialogSkillId);
      const goalDialog = goalDialogSkill
        ? renderGoalDialog(goalDialogSkill, player, {
            onCreate: (draft) => {
              goals = [...goals, draft];
              saveGoals(player.slug, goals);
            },
            onClose: () => {
              goalDialogSkillId = null;
              render();
            },
          })
        : null;

      replaceChildren(dom.panel, el('div', { class: 'page-tabs' }, [tabs]), body, goalDialog);

      if (questSearchFocused) {
        const input = dom.panel.querySelector('.quest-search-input');
        if (input) {
          input.focus();
          if (questSearchCaret !== null) input.setSelectionRange(questSearchCaret, questSearchCaret);
        }
      }

      goalDialog?.showModal();
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
