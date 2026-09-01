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
import { renderQuestDependencyGraph, clearFullscreenPortal } from './views/quest-dependency-graph.js';
import { renderQuestSeriesLinks } from './views/quest-series-links.js';
import { renderQuestPlanner } from './views/quest-planner.js';
import { renderGoalsList, renderGoalDialog, renderQuestGoalDialog, renderDeleteConfirmDialog, renderGoalCelebrationDialog, refreshGoals } from './views/player-goals.js';
import { tabToggle } from './views/tabs.js';
import { loadGoalsAndLabels, createGoals, updateGoal, deleteGoal } from './goals-storage.js';
import { putGoalLabel, deleteGoalLabel } from './goal-labels-storage.js';
import { mountAuthWidget } from './views/auth-widget.js';
import { mountRefreshButton } from './views/refresh-button.js';
import { getSession, subscribeSession } from './session.js';

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

/**
 * A handful of query-string params seed the very first render, so a URL is
 * enough to hand someone else (or your own future self) a link straight to
 * a particular spot on this page. Read once in boot() (readLinkParams,
 * below) — but kept in sync afterward too: every render() call rewrites
 * the address bar to match whatever's currently selected (syncUrlToState,
 * below render()'s own definition), via history.replaceState so clicking
 * around the Quests tab never piles up back-button entries. Copy the URL
 * at any point and it reopens to exactly what's on screen. All optional;
 * absent or unmatched on load, the page falls back to its usual
 * persisted-state behaviour (loadStatsState) exactly as if none of this
 * existed.
 *
 * - `?tab=stats|quests|goals` — which PAGE_TABS entry is open, same values
 *   the tab strip itself uses. Beats the persisted tab on load if both are
 *   present. Only ever written back when there's nothing more specific to
 *   say (no quest/series selected) — see syncUrlToState.
 * - `?quest=<slug>` — Quests tab, anchors the dependency map on this one
 *   quest (quest-data's own `slug`), same as clicking its list row.
 * - `?series=<name>` — Quests tab, anchors the map on this whole questline
 *   instead (quest-data's own `series`, e.g. `Mahjarrat%20Mysteries`), same
 *   as clicking its quest-series-links.js chip. Ignored if `quest` is also
 *   given (a single quest is a stricter pick, so it wins).
 * - `?node=<slug>` — alongside either `quest` or `series`: additionally
 *   highlights one particular quest in the map (onHighlightNode's own
 *   effect), same as clicking its name.
 *
 * `quest`/`series` implicitly open the Quests tab even without an explicit
 * `tab=quests` — there's no reason to link someone to one of those and land
 * them on Stats instead. Applied once quest-data itself has actually
 * loaded (applyQuestLinkParams, called from ensureQuestsLoaded) since
 * resolving a slug/series name needs the real list; an unmatched slug or
 * name is silently ignored rather than left half-applied or erroring.
 */
function readLinkParams() {
  const params = new URLSearchParams(location.search);
  return {
    tab: params.get('tab'),
    questSlug: params.get('quest'),
    seriesName: params.get('series'),
    nodeSlug: params.get('node'),
  };
}

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

/**
 * Reconciles the server's copy of this player's goals with what
 * refreshGoals (player-goals.js, pure and unit-tested) just recomputed
 * against live data — a goal isRenderable dropped entirely (a dangling
 * skillId) gets deleted server-side too; a goal whose completedAt just
 * flipped from null gets that stamp PATCHed through. Fire-and-forget: a
 * sync failure here (network hiccup, or ownership changing mid-flight)
 * only means completion gets re-checked and re-synced on the next visit,
 * same as refreshGoals's own "first noticed complete on a visit" semantics
 * already implied before there was a server to sync to at all.
 */
function syncGoalCompletion(slug, previousGoals, nextGoals) {
  const nextIds = new Set(nextGoals.map((goal) => goal.id));
  for (const goal of previousGoals) {
    if (!nextIds.has(goal.id)) {
      deleteGoal(slug, goal.id).catch((error) => console.error('Could not sync a dropped goal:', error));
    }
  }

  const previousById = new Map(previousGoals.map((goal) => [goal.id, goal]));
  for (const goal of nextGoals) {
    const before = previousById.get(goal.id);
    if (before && before.completedAt !== goal.completedAt) {
      updateGoal(slug, goal.id, { completedAt: goal.completedAt, completedLevel: goal.completedLevel, completedXp: goal.completedXp }).catch(
        (error) => console.error('Could not sync goal completion:', error),
      );
    }
  }
}

async function boot() {
  const slug = document.body.dataset.player;

  try {
    const [data, initialSession] = await Promise.all([
      loadGroupData(),
      getSession().catch(() => ({ user: null, player: null, unclaimed: [] })),
    ]);
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
      snapshots: data.snapshots,
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
    const linkParams = readLinkParams();
    const wantsQuestsTabFromLink = Boolean(linkParams.questSlug || linkParams.seriesName);
    let activeTab = oneOf(
      PAGE_TABS,
      linkParams.tab,
      wantsQuestsTabFromLink ? 'quests' : oneOf(PAGE_TABS, savedState.tab, PAGE_TABS[0][0]),
    );
    let previousTab = null;
    let questsState = { status: 'loading' };
    let questsRequested = false;
    let questSearch = typeof savedState.questSearch === 'string' ? savedState.questSearch : '';
    let questSort = oneOf(SORT_OPTIONS, savedState.questSort, SORT_OPTIONS[0][0]);
    let questStatusFilter = oneOf(STATUS_OPTIONS, savedState.questStatus, STATUS_OPTIONS[0][0]);
    let questSkillFilter = oneOf(SKILL_OPTIONS, savedState.questSkillReq, SKILL_OPTIONS[0][0]);
    let questlinesCollapsed = savedState.questlinesCollapsed === true;
    // Which quest the dependency map beside the list is anchored on — set
    // by clicking a list row (see render()), or seeded once from a
    // ?quest=<slug> link (applyQuestLinkParams, once quest-data itself has
    // loaded). Nothing below is persisted to localStorage; a reload with no
    // link param always starts fresh.
    let selectedQuestSlug = null;
    // Which questline is anchored instead — set only by clicking a
    // quest-series-links.js chip. Mutually exclusive with selectedQuestSlug
    // (onSelectQuest/onSelectSeries below each clear the other): the map
    // shows either one quest's own chain or a whole questline's members at
    // once (quest-graph.js's multi-target dependencyGraphFor/
    // visibleDependencyGraph), never both.
    let selectedSeriesName = null;
    // Quest *names* (not slugs — quest-graph.js's own node identity)
    // currently expanded within that map, revealing their own direct
    // requirements (quest-dependency-graph.js's own "+"/"–" button).
    // Recomputed from scratch whenever a different quest or questline is
    // selected (initialExpansionFor, quest-graph.js — seeded from every
    // member at once for a questline) rather than inheriting some other
    // chain's expansion state — every branch starts already unfolded down
    // to what this player still has left to do, not a lone collapsed node.
    let expandedQuestNames = new Set();
    // Which single quest name is selected for highlighting within that same
    // map (clicking anywhere on a node besides its "+"/"–" button) — dims
    // everything outside its branch rather than changing what's expanded.
    // Fully independent of expandedQuestNames; reset alongside
    // selectedQuestSlug since a highlight from one target's chain means
    // nothing in another's.
    let highlightedQuestName = null;
    // Whether the dependency map card is currently shown as a full-viewport
    // overlay (its own toggle button, quest-dependency-graph.js) — an
    // ordinary piece of render state, not the native Fullscreen API: that
    // API's state lives outside this app's own model and would need
    // special-casing around every render() (which tears down and rebuilds
    // the whole panel on any change, including a node click inside the map
    // itself — exactly the interaction someone examining a big graph in
    // fullscreen would keep doing), so a plain CSS "fill the viewport"
    // overlay driven by ordinary state composes with that rebuild-everything
    // model for free instead of fighting it. Also more broadly compatible —
    // Element.requestFullscreen() is unreliable-to-absent on iOS Safari.
    let questGraphFullscreen = false;

    // Shared by onSelectQuest/onSelectSeries (render(), Quests tab body) and
    // applyQuestLinkParams (query-param deep links) below: every branch from
    // every name in `targetNames`, expanded until (and including) the first
    // quest this player's already completed — what they still have left to
    // do, already unfolded, rather than a lone collapsed node (or, for a
    // questline, several) they'd have to click their way down from scratch
    // every time (initialExpansionFor, quest-graph.js). Takes `quests`
    // explicitly rather than closing over it since applyQuestLinkParams
    // calls this before questsState itself is ever set.
    function expandForTargets(quests, targetNames) {
      if (!quests) return new Set();
      const byName = new Map(quests.map((candidate) => [candidate.name, candidate]));
      const completedSet = new Set(player.completedQuests ?? []);
      const startedSet = new Set(player.startedQuests ?? []);
      const isCompleted = (name) => {
        const match = byName.get(name);
        return match ? statusOf(match, completedSet, startedSet) === 'completed' : false;
      };
      return initialExpansionFor(quests, targetNames, isCompleted);
    }

    // Applies linkParams.questSlug/seriesName/nodeSlug (readLinkParams,
    // above) once quest-data has actually loaded (ensureQuestsLoaded) —
    // seeds the same selectedQuestSlug/selectedSeriesName/
    // expandedQuestNames/highlightedQuestName a click would, so a shared
    // link opens straight onto whatever it pointed at instead of needing a
    // second click once the page catches up. Only ever runs once (guarded
    // by ensureQuestsLoaded's own questsRequested), so there's no risk of
    // re-applying the link over a viewer's own later clicks.
    function applyQuestLinkParams(quests) {
      if (linkParams.questSlug) {
        const quest = quests.find((candidate) => candidate.slug === linkParams.questSlug);
        if (quest) {
          selectedQuestSlug = quest.slug;
          expandedQuestNames = expandForTargets(quests, [quest.name]);
          // node is scoped to *any* quest here, not just this one's own
          // chain — highlighting works the same regardless of selection
          // kind (onHighlightNode, render()), so a linked node just needs
          // to resolve to a real quest; if it never actually shows up in
          // the expanded chain, highlightSetFor (quest-graph.js) already
          // treats that as nothing highlighted rather than an error.
          if (linkParams.nodeSlug) {
            const node = quests.find((candidate) => candidate.slug === linkParams.nodeSlug);
            if (node) highlightedQuestName = node.name;
          }
        }
        return;
      }
      if (linkParams.seriesName) {
        const members = quests.filter((quest) => quest.series === linkParams.seriesName);
        if (members.length === 0) return;
        selectedSeriesName = linkParams.seriesName;
        expandedQuestNames = expandForTargets(quests, members.map((quest) => quest.name));
        if (linkParams.nodeSlug) {
          const node = members.find((quest) => quest.slug === linkParams.nodeSlug);
          if (node) highlightedQuestName = node.name;
        }
      }
    }

    // Goals are shared now (see the plan) — this GET is public, same as the
    // hiscore data above, so every viewer sees the same list regardless of
    // whether they're signed in. `canEditGoals()` below is the only gate;
    // it's a function rather than a plain boolean because `session` gets
    // reassigned by the subscribeSession listener near the bottom of this
    // function whenever the viewer signs in/out or claims a slug mid-visit.
    let session = initialSession;
    const canEditGoals = () => session.player?.slug === slug;

    // Goals are checked against this player's skills once, right after
    // loading them — skills don't change again for the rest of the visit
    // (only a real reload pulls fresh data), so there's nothing to gain by
    // re-checking on every render. `goalDialogSkillId`/`deleteConfirmGoalId`
    // (which of the two goal dialogs is open, or null) never persist across
    // a reload, and never need resetting on a tab switch either: a native
    // <dialog> shown via showModal() makes the rest of the page inert, so
    // there's no way to reach the tab buttons while one is actually open.
    const { goals: loadedGoals, labels: loadedLabels } = await loadGoalsAndLabels(player.slug);
    let goals = loadedGoals;
    let labels = loadedLabels;
    const refreshedGoals = refreshGoals(goals, player);
    // Only the owner's own visit pushes recomputed completion back to the
    // server — a signed-out or non-owner visitor still sees correct,
    // freshly-recomputed completion state on screen (refreshGoals ran
    // regardless), it just isn't this browser's place to persist it.
    if (refreshedGoals.changed && canEditGoals()) syncGoalCompletion(player.slug, goals, refreshedGoals.goals);
    goals = refreshedGoals.goals;
    // Whichever goals refreshGoals just noticed crossing their target on
    // *this* visit (empty most of the time) — shown once, in
    // renderGoalCelebrationDialog, the first time the Goals tab is actually
    // open (immediately, if that's the tab a link/reload already lands on;
    // otherwise the moment a viewer switches to it). Cleared on that
    // dialog's own close, same never-persisted reasoning as the other goal
    // dialogs' own open/closed state below — a goal already celebrated once
    // this visit never needs to be again, and refreshGoals itself won't
    // re-report it next reload either (checkCompletion only ever sets
    // completedAt once).
    let celebratingGoals = refreshedGoals.justCompleted;
    let goalDialogSkillId = null;
    let deleteConfirmGoalId = null;
    // Which quest's "track this as a goal?" confirmation is open (the
    // dependency map's own "⚑" button, quest-dependency-graph.js) — a full
    // quest-data record, not just a name, since the dialog needs its
    // skillRequirements. Same never-persisted, dialog-owns-its-own-inertness
    // reasoning as the other two goal dialogs above.
    let questGoalDraftQuest = null;
    // Group titles currently collapsed in the Goals tab's own list
    // (renderGoalsList) — persisted (unlike expandedQuestNames on the Quests
    // tab, which stays in-memory-only): a viewer who's collapsed a finished
    // questline's goal group to get it out of the way wants it to *stay*
    // out of the way on the next visit, not reappear on every reload.
    // Stored as an array (saveStatsState only ever writes plain JSON) and
    // rebuilt into a Set here.
    let collapsedGoalGroups = new Set(Array.isArray(savedState.collapsedGoalGroups) ? savedState.collapsedGoalGroups : []);

    // `labels` (the name -> colour registry, separate from goals themselves
    // — see goal-labels-storage.js) was already fetched alongside goals
    // above. Creating a new label from inside the "new goal" dialog updates
    // this local copy immediately, without going through render(): that
    // dialog manages its own DOM in place (player-goals.js's
    // labelPickerField), and a full re-render here would tear it down
    // mid-pick, losing whatever labels were already added to this goal.
    //
    // Which label the Goals tab's own list is filtered to, or 'all' — see
    // renderGoalsList's own validation of this against whichever labels
    // actually appear on a current goal (deleting the last goal that used
    // one, or the label itself, shouldn't leave the list silently empty).
    let goalLabelFilter = typeof savedState.goalLabelFilter === 'string' ? savedState.goalLabelFilter : 'all';
    // The one goal (any kind — a nested quest requirement included)
    // currently picked out for the toolbar's own focus panel, or null —
    // persisted like goalLabelFilter/collapsedGoalGroups above, since a
    // focus a viewer deliberately picked should still be there on their
    // next visit. renderGoalsList already falls back to no focus if this
    // ever names a goal that got deleted since.
    let focusGoalId = typeof savedState.focusGoalId === 'string' ? savedState.focusGoalId : null;

    function persistStatsState() {
      saveStatsState({
        tab: activeTab,
        questSearch,
        questSort,
        questStatus: questStatusFilter,
        questSkillReq: questSkillFilter,
        questlinesCollapsed,
        goalLabelFilter,
        collapsedGoalGroups: [...collapsedGoalGroups],
        focusGoalId,
      });
    }

    function ensureQuestsLoaded() {
      if (questsRequested) return;
      questsRequested = true;
      loadQuests()
        .then((quests) => {
          questsState = { status: 'ready', quests };
          applyQuestLinkParams(quests);
          render();
        })
        .catch((error) => {
          console.error(error);
          questsState = { status: 'error', message: 'Could not load quest data.' };
          render();
        });
    }

    // Rewrites the address bar to match activeTab/selectedQuestSlug/
    // selectedSeriesName/highlightedQuestName — the write-side counterpart
    // to readLinkParams/applyQuestLinkParams above, called at the top of
    // every render() so the URL is always an up-to-date, copy-pasteable
    // link to whatever's currently on screen. quest/series only ever get
    // written while actually on the Quests tab — both stay set in memory
    // after switching away (so flipping back doesn't lose the selection),
    // but a copied URL taken from e.g. the Goals tab should say `tab=goals`,
    // not resurrect a stale quest that isn't even visible right now.
    // history.replaceState, not pushState: this is a running "what's on
    // screen" reflection, not a navigation history a viewer would expect
    // the back button to step through one click at a time.
    function syncUrlToState() {
      const params = new URLSearchParams();

      if (activeTab === 'quests' && selectedQuestSlug) {
        params.set('quest', selectedQuestSlug);
      } else if (activeTab === 'quests' && selectedSeriesName) {
        params.set('series', selectedSeriesName);
      } else if (activeTab !== PAGE_TABS[0][0]) {
        params.set('tab', activeTab);
      }

      if (activeTab === 'quests' && (selectedQuestSlug || selectedSeriesName) && highlightedQuestName) {
        const quests = questsState.status === 'ready' ? questsState.quests : null;
        const node = quests?.find((quest) => quest.name === highlightedQuestName);
        if (node) params.set('node', node.slug);
      }

      const search = params.toString();
      const url = location.pathname + (search ? `?${search}` : '');
      if (url !== location.pathname + location.search) history.replaceState(null, '', url);
    }

    function render() {
      // Keeps the address bar in sync before anything else — see
      // syncUrlToState's own doc comment.
      syncUrlToState();

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

      // Same reasoning as the search box above, for the dependency map's own
      // scroll position: a highlight click (onHighlightNode) only changes
      // which nodes/edges carry is-dimmed/is-highlighted, but replacing the
      // whole .quest-graph-scroll div still resets a plain element's own
      // scrollLeft/scrollTop to 0 — otherwise a viewer scrolled into a big
      // chain (Sliske's Endgame, say) gets snapped back to the top-left on
      // every click. Queried document-wide, not scoped to dom.panel — while
      // the map is fullscreen it lives in its own body-level portal instead
      // (see quest-dependency-graph.js's ensureFullscreenPortal), and this
      // needs to find it there too. Snapshotting before clearFullscreenPortal
      // (below) runs is what keeps this from finding an already-emptied one.
      const questGraphScroll = document.querySelector('.quest-graph-scroll');
      const questGraphScrollPosition = questGraphScroll ? { left: questGraphScroll.scrollLeft, top: questGraphScroll.scrollTop } : null;

      // Unconditional, before anything else below decides what actually
      // renders this pass — see clearFullscreenPortal's own doc comment for
      // why this can't just live inside renderQuestDependencyGraph alone.
      clearFullscreenPortal();

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
          // The dependency map's fullscreen overlay only ever renders on the
          // Quests tab (it's inside that tab's own body below) — leaving
          // questGraphFullscreen set while switching away would strand
          // document.body's own overflow: hidden lock (set for that overlay,
          // cleared alongside it — see render()'s own side effect) with
          // nothing left to clear it, silently breaking scroll on every
          // other tab.
          if (tab !== 'quests') questGraphFullscreen = false;
          persistStatsState();
          if (tab === 'quests') ensureQuestsLoaded();
          render();
        },
      });

      const editingGoals = canEditGoals();

      const body =
        activeTab === 'goals'
          ? el('div', { class: 'player-row' }, [
              renderPlayerSkills(player, todayLevelGains, null, (skillId) => {
                if (!editingGoals) return;
                goalDialogSkillId = skillId;
                render();
              }),
              renderGoalsList(player, goals, labels, {
                readOnlyHint: editingGoals ? null : `Sign in with Discord and claim ${player.name} to set goals.`,
                labelFilter: goalLabelFilter,
                onLabelFilterChange: (value) => {
                  goalLabelFilter = value;
                  persistStatsState();
                  render();
                },
                onDeleteGoal: editingGoals
                  ? (goalId) => {
                      deleteConfirmGoalId = goalId;
                      render();
                    }
                  : null,
                collapsedGroups: collapsedGoalGroups,
                onToggleGroup: (title) => {
                  const next = new Set(collapsedGoalGroups);
                  if (next.has(title)) next.delete(title);
                  else next.add(title);
                  collapsedGoalGroups = next;
                  persistStatsState();
                  render();
                },
                focusGoalId,
                onFocusGoal: (goalId) => {
                  focusGoalId = goalId;
                  persistStatsState();
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
                // Picking a single quest always leaves questline mode.
                selectedSeriesName = null;
                expandedQuestNames = reselecting ? new Set() : expandForTargets(quests, [quest.name]);
                // A highlight from whatever was previously selected (or a
                // different target's chain entirely) means nothing here.
                highlightedQuestName = null;
                render();
              };
              const onSelectSeries = (seriesName) => {
                // Same click-to-toggle shape as onSelectQuest.
                const reselecting = selectedSeriesName === seriesName;
                selectedSeriesName = reselecting ? null : seriesName;
                selectedQuestSlug = null;
                const memberNames = reselecting || !quests ? [] : quests.filter((quest) => quest.series === seriesName).map((quest) => quest.name);
                expandedQuestNames = reselecting ? new Set() : expandForTargets(quests, memberNames);
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
              const onToggleQuestlinesCollapsed = () => {
                questlinesCollapsed = !questlinesCollapsed;
                persistStatsState();
                render();
              };
              // Every quest name that already anchors a goal-group — hides
              // a not-started node's own "track as a goal" button once
              // there's already one, so the dialog can't be used twice on
              // the same quest and duplicate its group.
              const existingQuestGoalNames = new Set(
                goals.filter((goal) => goal.kind === 'quest').map((goal) => goal.questName),
              );
              // What the dependency map itself is currently anchored on —
              // see quest-dependency-graph.js's own `selection` doc comment.
              // selectedSeriesName/selectedQuestSlug are already kept
              // mutually exclusive by onSelectQuest/onSelectSeries above, so
              // only one branch here is ever non-null at a time.
              const selection = selectedSeriesName
                ? { kind: 'series', seriesName: selectedSeriesName }
                : selectedQuest
                  ? { kind: 'quest', quest: selectedQuest }
                  : null;

              return el('div', {}, [
                renderQuestSeriesLinks(
                  quests,
                  player,
                  selectedSeriesName,
                  questlinesCollapsed,
                  onToggleQuestlinesCollapsed,
                  onSelectSeries,
                ),
                el('div', { class: 'player-row' }, [
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
                    selection,
                    expandedNames: expandedQuestNames,
                    onToggleExpand,
                    highlightedName: highlightedQuestName,
                    onHighlightNode,
                    existingQuestGoalNames,
                    onCreateQuestGoal: editingGoals
                      ? (quest) => {
                          questGoalDraftQuest = quest;
                          render();
                        }
                      : null,
                    isFullscreen: questGraphFullscreen,
                    onToggleFullscreen: () => {
                      questGraphFullscreen = !questGraphFullscreen;
                      render();
                    },
                  }),
                ]),
                quests ? renderQuestPlanner(quests, player, onSelectQuest, onSelectSeries) : null,
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
      // four goal dialogs below ever open at once — each only opens from a
      // button (or, for celebrationDialog, just landing on the Goals tab
      // with something to celebrate) on whichever tab is currently showing,
      // and a native <dialog> makes the rest of the page (including the tab
      // strip and every skill cell that could open another one) inert the
      // moment one is open — so there's no need to guard against more than
      // one being non-null together.
      const goalDialogSkill = goalDialogSkillId === null ? null : SKILLS.find((skill) => skill.id === goalDialogSkillId);
      const goalDialog = goalDialogSkill
        ? renderGoalDialog(goalDialogSkill, player, goals, labels, {
            onCreate: (draft) => {
              // renderGoalDialog never sets `kind` on a plain skill-grid
              // draft (only buildQuestGoalDrafts does) — the API requires
              // it on every goal, so it's filled in at this one boundary
              // rather than changing what the dialog itself builds.
              const goal = { ...draft, kind: draft.kind ?? 'skill' };
              goals = [...goals, goal];
              createGoals(player.slug, [goal]).catch((error) => {
                console.error('Could not save the new goal:', error);
                goals = goals.filter((candidate) => candidate.id !== goal.id);
                render();
              });
            },
            onClose: () => {
              goalDialogSkillId = null;
              render();
            },
            onCreateLabel: (name, colour) => {
              labels = [...labels, { name, colour }];
              putGoalLabel(player.slug, name, colour).catch((error) => console.error('Could not save the new label:', error));
            },
            // Deletes the label from the registry only — see
            // labelPickerField's own doc comment for why an existing
            // goal's chip is unaffected (it stores the name, not a live
            // reference into this array).
            onDeleteLabel: (name) => {
              labels = labels.filter((label) => label.name !== name);
              deleteGoalLabel(player.slug, name).catch((error) => console.error('Could not delete the label:', error));
            },
          })
        : null;

      const deleteConfirmGoal = deleteConfirmGoalId === null ? null : goals.find((goal) => goal.id === deleteConfirmGoalId);
      const deleteConfirmDialog = deleteConfirmGoal
        ? renderDeleteConfirmDialog(deleteConfirmGoal, SKILLS.find((skill) => skill.id === deleteConfirmGoal.skillId), {
            onConfirm: () => {
              const removed = deleteConfirmGoal;
              goals = goals.filter((goal) => goal.id !== removed.id);
              deleteGoal(player.slug, removed.id).catch((error) => {
                console.error('Could not delete the goal:', error);
                goals = [...goals, removed];
                render();
              });
            },
            onClose: () => {
              deleteConfirmGoalId = null;
              render();
            },
          })
        : null;

      // questGoalDraftQuest can only ever be set by a click inside the
      // dependency map itself (quest-dependency-graph.js's "⚑" button),
      // which only renders once questsState is 'ready' — so recomputing the
      // same list here (rather than threading the Quests tab's own `quests`
      // constant out of its block) is always the real list, never null, by
      // the time this dialog actually opens.
      const quests = questsState.status === 'ready' ? questsState.quests : null;
      const questGoalDialog = questGoalDraftQuest
        ? renderQuestGoalDialog(questGoalDraftQuest, player, quests, {
            onConfirm: (drafts) => {
              goals = [...goals, ...drafts];
              createGoals(player.slug, drafts).catch((error) => {
                console.error('Could not save the quest goals:', error);
                const draftIds = new Set(drafts.map((draft) => draft.id));
                goals = goals.filter((goal) => !draftIds.has(goal.id));
                render();
              });
            },
            onClose: () => {
              questGoalDraftQuest = null;
              render();
            },
          })
        : null;

      // Only while the Goals tab itself is actually showing — a viewer who
      // loaded straight onto Stats/Quests shouldn't be met with a popup
      // about a tab they haven't opened yet; the moment they do switch to
      // Goals, this same celebratingGoals list is still sitting there ready.
      const celebrationDialog =
        activeTab === 'goals' && celebratingGoals.length > 0
          ? renderGoalCelebrationDialog(celebratingGoals, {
              onClose: () => {
                celebratingGoals = [];
                render();
              },
            })
          : null;

      replaceChildren(
        dom.panel,
        el('div', { class: 'page-tabs' }, [tabs]),
        body,
        goalDialog,
        deleteConfirmDialog,
        questGoalDialog,
        celebrationDialog,
      );

      // The dependency map's fullscreen overlay covers the whole viewport
      // (styles.css's .quest-flowchart.is-fullscreen) but sits in normal
      // document flow underneath — without this, the page itself would
      // still scroll behind it.
      document.body.style.overflow = questGraphFullscreen ? 'hidden' : '';

      if (questSearchFocused) {
        const input = dom.panel.querySelector('.quest-search-input');
        if (input) {
          input.focus();
          if (questSearchCaret !== null) input.setSelectionRange(questSearchCaret, questSearchCaret);
        }
      }

      if (questGraphScrollPosition) {
        const freshQuestGraphScroll = document.querySelector('.quest-graph-scroll');
        if (freshQuestGraphScroll) {
          freshQuestGraphScroll.scrollLeft = questGraphScrollPosition.left;
          freshQuestGraphScroll.scrollTop = questGraphScrollPosition.top;
        }
      }

      goalDialog?.showModal();
      deleteConfirmDialog?.showModal();
      questGoalDialog?.showModal();
      celebrationDialog?.showModal();
    }

    // Escape is the standard way out of any fullscreen-shaped UI; the
    // overlay is plain CSS rather than the native Fullscreen API (see
    // questGraphFullscreen's own doc comment above), so nothing closes it
    // for free the way a real fullscreen element or a native <dialog> would.
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && questGraphFullscreen) {
        questGraphFullscreen = false;
        render();
      }
    });

    // Keeps `session` (and so canEditGoals()) current after a claim or
    // sign-out that happens while already on this page — see session.js's
    // own doc comment. The mountAuthWidget instance that actually publishes
    // these lives independently, at module scope below.
    subscribeSession((nextSession) => {
      session = nextSession;
      render();
    });

    if (activeTab === 'quests') ensureQuestsLoaded();
    render();
  } catch (error) {
    console.error(error);
    renderFatal(error.message);
  } finally {
    document.body.dataset.ready = 'true';
  }
}

// Independent of the player-data load in boot(): a session hiccup must
// never hold up the stats page rendering, and vice versa.
mountAuthWidget(document.getElementById('auth-widget'));
mountRefreshButton(document.getElementById('refresh-button'), { scope: 'player', slug: document.body.dataset.player });

boot();
