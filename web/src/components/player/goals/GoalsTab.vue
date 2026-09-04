<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

import { SKILLS } from '@shared/config.js';
import { refreshGoals } from '@shared/goal-status.js';
import { useGoals } from '@/composables/useGoals';
import type { StatsPageState } from '@/composables/useStatsPageState';
import GoalsList from '@/components/player/goals/GoalsList.vue';
import GoalDialog from '@/components/player/goals/GoalDialog.vue';
import DeleteConfirmDialog from '@/components/player/goals/DeleteConfirmDialog.vue';
import GoalCelebrationDialog from '@/components/player/goals/GoalCelebrationDialog.vue';
import QuestGoalDialog from '@/components/player/quests/QuestGoalDialog.vue';

/**
 * The Goals tab's own orchestration: loads this player's goals (lazily,
 * only once this tab is open — see useGoals.ts), re-checks completion
 * against the live player data, persists any change, and ties the list +
 * three dialogs together. Ported from stats.js's own Goals-tab slice.
 *
 * TEMP: no ownership gate — Discord auth is disabled for now, so every
 * visitor can edit (see useGoals.ts's own doc comment for the local-storage
 * bypass this pairs with, and how to restore both together).
 */
const props = defineProps<{
  player: any;
  statsState: StatsPageState;
  newGoalSkillId: number | null;
  // Set by PlayerView.vue's own "Set Quest Goals" picker (QuestList.vue, mode
  // "pick-goal", under the Set Skill Goals grid) — a row click there means
  // "prompt to track this quest", same confirmation the dependency map's
  // own per-node "⚑" button opens (QuestsTab.vue). `quests` is the full
  // quest-data list that dialog needs for its "include the whole
  // prerequisite tree" option; null until the Goals tab has actually
  // requested it (PlayerView.vue's own lazy useQuests()).
  newGoalQuest: any | null;
  quests: any[] | null;
}>();

const emit = defineEmits<{ clearNewGoalSkill: []; clearNewGoalQuest: [] }>();

const canEdit = true;

const { goals, labels, reload, create, remove, syncCompletion, putLabel, removeLabel } = useGoals(props.player.slug);
onMounted(reload);

const bySkillId = new Map(SKILLS.map((skill: any) => [skill.id, skill]));

// Re-checked whenever the goal list or the live player data changes (a
// refresh, cron or the refresh button, can complete a goal same as
// visiting fresh) — checkCompletion is idempotent, so re-running this
// against its own just-applied output below is a safe no-op, not a loop.
const refreshed = computed(() => refreshGoals(goals.value, props.player));
const celebratingGoals = ref<any[]>([]);

watch(refreshed, (value) => {
  if (!value.changed) return;
  const previous = goals.value;
  goals.value = value.goals;
  syncCompletion(previous, value.goals);
  if (value.justCompleted.length > 0) celebratingGoals.value = value.justCompleted;
});

const readOnlyHint = null;

const collapsedGroupsSet = computed(() => new Set(props.statsState.collapsedGoalGroups));
function toggleGroup(title: string) {
  const next = new Set(props.statsState.collapsedGoalGroups);
  if (next.has(title)) next.delete(title);
  else next.add(title);
  props.statsState.collapsedGoalGroups = [...next];
}

function focusGoal(id: string | null) {
  props.statsState.focusGoalId = id;
}

const deleteTargetId = ref<string | null>(null);
const deleteTarget = computed(() => goals.value.find((goal) => goal.id === deleteTargetId.value) ?? null);
const deleteTargetSkill = computed(() => (deleteTarget.value && deleteTarget.value.kind !== 'quest' ? bySkillId.get(deleteTarget.value.skillId) ?? null : null));

function requestDelete(id: string) {
  deleteTargetId.value = id;
}
function confirmDelete() {
  if (!deleteTarget.value) return;
  if (props.statsState.focusGoalId === deleteTarget.value.id) props.statsState.focusGoalId = null;
  remove(deleteTarget.value.id);
}

const newGoalSkill = computed(() => (props.newGoalSkillId !== null ? (bySkillId.get(props.newGoalSkillId) ?? null) : null));

function handleCreate(draft: any) {
  create([draft]);
  emit('clearNewGoalSkill');
}

// Same duplicate-guard the dependency map's own "⚑" button uses
// (canCreateQuestGoal, lib/questGraphLayout.ts) — a quest already anchoring
// a goal-group would otherwise get a second one from a picker click, which
// GoalsList's own itemsFor (one quest-kind goal per group) can't display
// sanely. Silently no-ops rather than erroring: PlayerView.vue's picker has
// no per-row way to grey out an already-tracked quest, so a click on one
// just doesn't open anything, same as the flag button already being absent
// there.
const existingQuestGoalNames = computed(() => new Set(goals.value.filter((goal) => goal.kind === 'quest').map((goal) => goal.questName)));
const questGoalDialogTarget = computed(() =>
  props.newGoalQuest && !existingQuestGoalNames.value.has(props.newGoalQuest.name) ? props.newGoalQuest : null,
);

// An ineligible pick (below) never opens the dialog, so it never gets the
// close/confirm event that normally clears PlayerView.vue's own
// newGoalQuest back to null — left alone, that stale prop would silently
// "reactivate" later the moment existingQuestGoalNames next changes for any
// other reason (e.g. deleting that same goal elsewhere makes it look
// eligible again), popping the dialog open with no click behind it. Clear
// it straight back proactively instead of leaving it dangling.
watch(
  () => props.newGoalQuest,
  (quest) => {
    if (quest && existingQuestGoalNames.value.has(quest.name)) emit('clearNewGoalQuest');
  },
);

function handleConfirmQuestGoal(drafts: any[]) {
  create(drafts);
  emit('clearNewGoalQuest');
}
</script>

<template>
  <GoalsList
    :player="player"
    :goals="goals"
    :labels="labels"
    :read-only-hint="readOnlyHint"
    :label-filter="statsState.goalLabelFilter"
    :collapsed-groups="collapsedGroupsSet"
    :focus-goal-id="statsState.focusGoalId"
    :can-edit="canEdit"
    :quests="quests"
    @update:label-filter="(v) => (statsState.goalLabelFilter = v)"
    @toggle-group="toggleGroup"
    @focus="focusGoal"
    @delete="requestDelete"
  />

  <GoalDialog
    v-if="newGoalSkill"
    :skill="newGoalSkill"
    :player="player"
    :goals="goals"
    :labels="labels"
    @create="handleCreate"
    @close="emit('clearNewGoalSkill')"
    @create-label="(n, c) => putLabel(n, c)"
    @delete-label="(n) => removeLabel(n)"
  />

  <DeleteConfirmDialog v-if="deleteTarget" :goal="deleteTarget" :skill="deleteTargetSkill" @confirm="confirmDelete" @close="deleteTargetId = null" />

  <QuestGoalDialog
    v-if="questGoalDialogTarget"
    :quest="questGoalDialogTarget"
    :player="player"
    :quests="quests"
    @confirm="handleConfirmQuestGoal"
    @close="emit('clearNewGoalQuest')"
  />

  <GoalCelebrationDialog v-if="celebratingGoals.length > 0" :goals="celebratingGoals" @close="celebratingGoals = []" />
</template>
