<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { SKILLS } from '@shared/config.js';
import { distinctLabelNames, goalSections, itemsFor, orderSectionsByStatus, sectionIsComplete } from '@/lib/goals';
import { usePrefs } from '@/composables/usePrefs';
import GoalCard from '@/components/player/goals/GoalCard.vue';
import GoalFocusPanel from '@/components/player/goals/GoalFocusPanel.vue';
import GoalsGraph from '@/components/player/goals/GoalsGraph.vue';

/**
 * The Goals tab's own list — every goal set for `player`, segmented into
 * one visual block per group so a viewer with several goals going at once
 * can tell them apart at a glance; within each block, active-then-completed
 * ordering applies. Ported from player-goals.js's renderGoalsList.
 */
const props = defineProps<{
  player: any;
  goals: any[];
  labels: Array<{ name: string; colour: string }>;
  readOnlyHint: string | null;
  labelFilter: string;
  collapsedGroups: Set<string>;
  focusGoalId: string | null;
  canEdit: boolean;
  // The full quest-data list, for GoalsGraph.vue's own quest-requires-quest
  // edges — same lazily-loaded prop GoalsTab.vue already threads to
  // QuestGoalDialog.vue, null until the Goals tab has actually requested it.
  quests: any[] | null;
}>();

const emit = defineEmits<{
  'update:labelFilter': [value: string];
  toggleGroup: [title: string];
  focus: [id: string | null];
  delete: [id: string];
}>();

const bySkillId = new Map(SKILLS.map((skill: any) => [skill.id, skill]));
const labelsByName = computed(() => new Map(props.labels.map((label) => [label.name, label.colour])));

const focusedGoal = computed(() => props.goals.find((goal) => goal.id === props.focusGoalId) ?? null);

const usedLabelNames = computed(() => distinctLabelNames(props.goals));
const effectiveFilter = computed(() => (usedLabelNames.value.includes(props.labelFilter) ? props.labelFilter : 'all'));

const filteredGoals = computed(() =>
  effectiveFilter.value === 'all' ? props.goals : props.goals.filter((goal) => (goal.labels ?? []).includes(effectiveFilter.value)),
);

const emptyMessage = computed(() => {
  if (props.goals.length > 0) return 'No goals match this label.';
  return props.readOnlyHint ? 'No goals set yet.' : 'No goals yet — click a skill to set one.';
});

const sections = computed(() => orderSectionsByStatus(goalSections(filteredGoals.value)));

function toggleFocus(id: string) {
  emit('focus', props.focusGoalId === id ? null : id);
}

// List (the original card-per-group layout) or Graph (every goal as a node,
// a quest goal's own skill requirements drawn as prerequisites feeding into
// it — GoalsGraph.vue). Persisted the same way Gains/Standings remember
// their own grid/line choice (useGainsViewState) — a viewer who prefers the
// graph shouldn't have to re-toggle it on every visit.
const { prefs, savePref } = usePrefs();
const view = ref<'list' | 'graph'>(prefs.goalsView === 'graph' ? 'graph' : 'list');
watch(view, (value) => savePref({ goalsView: value }));
</script>

<template>
  <section class="lb" :style="{ '--accent': player.colour }">
    <div class="lb-head">
      <div class="lb-title"><h2>Goals</h2></div>
      <div class="gains-view-tabs" role="tablist" aria-label="Goals display">
        <button
          type="button"
          class="gains-view-toggle"
          :class="{ 'is-active': view === 'list' }"
          role="tab"
          :aria-selected="view === 'list'"
          title="Show the list"
          @click="view = 'list'"
        >
          <svg class="toggle-icon" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
            <rect x="1.5" y="2" width="15" height="3.2" rx="1" />
            <rect x="1.5" y="7.4" width="15" height="3.2" rx="1" />
            <rect x="1.5" y="12.8" width="15" height="3.2" rx="1" />
          </svg>
          <span class="visually-hidden">Show the list</span>
        </button>
        <button
          type="button"
          class="gains-view-toggle"
          :class="{ 'is-active': view === 'graph' }"
          role="tab"
          :aria-selected="view === 'graph'"
          title="Show the graph"
          @click="view = 'graph'"
        >
          <svg class="toggle-icon" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
            <line x1="3.5" y1="9" x2="9" y2="3.5" class="toggle-line" />
            <line x1="3.5" y1="9" x2="9" y2="14.5" class="toggle-line" />
            <line x1="9" y1="3.5" x2="15" y2="9" class="toggle-line" />
            <line x1="9" y1="14.5" x2="15" y2="9" class="toggle-line" />
            <circle cx="3.5" cy="9" r="1.6" />
            <circle cx="9" cy="3.5" r="1.6" />
            <circle cx="9" cy="14.5" r="1.6" />
            <circle cx="15" cy="9" r="1.6" />
          </svg>
          <span class="visually-hidden">Show the graph</span>
        </button>
      </div>
    </div>

    <p v-if="readOnlyHint" class="goals-readonly-hint">{{ readOnlyHint }}</p>

    <GoalFocusPanel
      v-if="focusedGoal"
      :goal="focusedGoal"
      :goals="goals"
      :by-skill-id="bySkillId"
      :player="player"
      :can-edit="canEdit"
      :focused-id="focusGoalId"
      @focus="toggleFocus"
      @delete="(id) => emit('delete', id)"
      @clear="emit('focus', null)"
    />

    <div v-if="usedLabelNames.length > 0" class="goal-filters">
      <label class="goal-filter">
        <span class="visually-hidden">Filter goals by label</span>
        <select class="goal-filter-select" :value="effectiveFilter" @change="emit('update:labelFilter', ($event.target as HTMLSelectElement).value)">
          <option value="all">All labels</option>
          <option v-for="name in usedLabelNames" :key="name" :value="name">{{ name }}</option>
        </select>
      </label>
    </div>

    <p v-if="filteredGoals.length === 0" class="chart-empty">{{ emptyMessage }}</p>

    <template v-else-if="view === 'list'">
      <div
        v-for="section in sections"
        :key="section.title ?? ' '"
        class="goal-group"
        :class="{ 'is-collapsed': section.title !== null && collapsedGroups.has(section.title), 'is-complete': sectionIsComplete(section) }"
      >
        <button
          v-if="section.title"
          type="button"
          class="goal-group-title"
          :aria-expanded="collapsedGroups.has(section.title) ? 'false' : 'true'"
          @click="emit('toggleGroup', section.title!)"
        >
          <span class="goal-group-chevron" aria-hidden="true" />
          <span v-if="sectionIsComplete(section)" class="goal-group-check" aria-hidden="true">✓</span>
          <span class="goal-group-name">{{ section.title }}</span>
          <span class="goal-group-count">{{ section.goals.length }}</span>
        </button>

        <ul v-if="section.title === null || !collapsedGroups.has(section.title)" class="goals-list">
          <GoalCard
            v-for="item in itemsFor(section)"
            :key="item.quest.id"
            :goal="item.quest"
            :child-goals="item.children"
            :by-skill-id="bySkillId"
            :player="player"
            :labels-by-name="labelsByName"
            :can-edit="canEdit"
            :focused-id="focusGoalId"
            @focus="toggleFocus"
            @delete="(id) => emit('delete', id)"
          />
        </ul>
      </div>
    </template>

    <GoalsGraph v-else :sections="sections" :by-skill-id="bySkillId" :player="player" :focused-id="focusGoalId" :quests="quests" @focus="toggleFocus" />
  </section>
</template>
