<script setup lang="ts">
import { computed } from 'vue';

import { formatNumber, formatCompact, formatSpan, formatRelativeTime } from '@shared/format.js';
import { iconFor, QUEST_POINTS_ICON, WIKI_ICON } from '@shared/config.js';
import { statusOf } from '@shared/quest-status.js';
import { questWikiUrl } from '@shared/quest-goal.js';
import { completedSkillStats, DEFAULT_LABEL_COLOUR, goalTargetLabel, orderByStatus, skillGoalProgress, startValueOf } from '@/lib/goals';
import SkillProgressRow from '@/components/player/goals/SkillProgressRow.vue';

/**
 * One goal card — skill or quest, active or completed — plus, for a quest
 * goal, every skill-requirement goal sharing its group nested inside as a
 * `.goal-subgoals` checklist. Ported from player-goals.js's four card
 * builders (activeSkillGoalCard/completedSkillGoalCard/activeQuestGoalCard/
 * completedQuestGoalCard) plus questGoalCard's nesting, unified into one
 * component since the four only really differ in which head/meta content
 * shows.
 */
const props = defineProps<{
  goal: any;
  childGoals?: any[];
  bySkillId: Map<number, any>;
  player: any;
  labelsByName: Map<string, string>;
  canEdit: boolean;
  focusedId: string | null;
}>();

const emit = defineEmits<{ focus: [id: string]; delete: [id: string] }>();

const COMPLETED_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const isQuest = computed(() => props.goal.kind === 'quest');
const skill = computed(() => (isQuest.value ? null : props.bySkillId.get(props.goal.skillId)));
const complete = computed(() => Boolean(props.goal.completedAt));
const isFocused = computed(() => props.goal.id === props.focusedId);
const orderedChildren = computed(() => orderByStatus(props.childGoals ?? []));

const questStatus = computed(() => {
  if (!isQuest.value) return null;
  const completedSet = new Set(props.player.completedQuests ?? []);
  const startedSet = new Set(props.player.startedQuests ?? []);
  return statusOf({ name: props.goal.questName }, completedSet, startedSet);
});

const skillProgress = computed(() => (isQuest.value ? null : skillGoalProgress(props.goal, skill.value, props.player, false)));

/** Active skill goal has no meta line at all (matches the legacy card
 * exactly) — everything worth saying already sits in its progress row. */
const metaParts = computed<string[] | null>(() => {
  if (isQuest.value) {
    if (complete.value) {
      return [
        `Completed ${COMPLETED_DATE.format(new Date(props.goal.completedAt))}`,
        `Took ${formatSpan(Date.parse(props.goal.completedAt) - Date.parse(props.goal.startedAt))}`,
      ];
    }
    return [`Started ${formatRelativeTime(props.goal.startedAt)}`];
  }
  if (!complete.value) return null;
  const { startedMs, completedMs, levelsGained, xpGained, ratePerDay } = completedSkillStats(props.goal);
  return [
    `Completed ${COMPLETED_DATE.format(new Date(completedMs))}`,
    `+${formatNumber(levelsGained)} level${levelsGained === 1 ? '' : 's'}`,
    `+${formatNumber(xpGained)} xp`,
    `Took ${formatSpan(completedMs - startedMs)}`,
    `${formatCompact(ratePerDay)} xp/day avg`,
  ];
});

function childProgress(child: any) {
  return skillGoalProgress(child, props.bySkillId.get(child.skillId), props.player, true);
}

/** A nested requirement row still sets itself as the tab's one focus goal
 * on click — except a click that actually landed on its own delete button,
 * which handles itself. A top-level card no longer does this (see
 * .goal-card-focus below); only a requirement row nested inside one still
 * uses this. */
function focusClick(id: string, event: MouseEvent) {
  if ((event.target as HTMLElement).closest('button, a')) return;
  event.stopPropagation();
  emit('focus', id);
}
</script>

<template>
  <li class="goal-card" :class="{ 'is-complete': complete, 'is-focused': isFocused }">
    <template v-if="isQuest">
      <div class="goal-card-head">
        <img class="goal-card-icon" :src="QUEST_POINTS_ICON" alt="" width="18" height="18" decoding="async" />
        <span class="goal-card-name">{{ goal.questName }}</span>
        <button
          type="button"
          class="goal-card-focus"
          :class="{ 'is-focused': isFocused }"
          :aria-pressed="isFocused"
          :title="isFocused ? 'Unfocus this goal' : 'Focus this goal'"
          @click="emit('focus', goal.id)"
        >
          <svg class="goal-card-focus-icon" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
            <circle cx="9" cy="6.2" r="4.2" />
            <polygon points="6.2,9.6 11.8,9.6 9,17" />
          </svg>
          <span class="visually-hidden">{{ isFocused ? 'Unfocus' : 'Focus' }} this goal</span>
        </button>
        <a
          class="goal-card-wiki-link"
          :href="questWikiUrl(goal.questName)"
          target="_blank"
          rel="noopener noreferrer"
          :aria-label="`Open ${goal.questName} quick guide on the wiki`"
          title="Quick guide (wiki)"
          @click.stop
        >
          <img :src="WIKI_ICON" alt="" width="14" height="14" decoding="async" />
        </a>
        <span v-if="complete" class="goal-card-target">✓ Completed</span>
        <template v-else>
          <span class="goal-card-current">{{ questStatus === 'in-progress' ? 'In progress' : 'Not started' }}</span>
          <span class="goal-card-head-spacer" />
        </template>
        <button v-if="canEdit" type="button" class="goal-card-delete" aria-label="Delete this goal" @click="emit('delete', goal.id)">×</button>
      </div>
      <div v-if="(goal.labels ?? []).length" class="goal-card-labels">
        <span v-for="name in goal.labels" :key="name" class="goal-card-label">
          <span class="swatch" :style="{ '--swatch': labelsByName.get(name) ?? DEFAULT_LABEL_COLOUR }" aria-hidden="true" />
          <span class="goal-card-label-name">{{ name }}</span>
        </span>
      </div>
      <p v-if="metaParts" class="goal-card-meta">
        <template v-for="(part, i) in metaParts" :key="i"><span v-if="i > 0" aria-hidden="true"> · </span><span>{{ part }}</span></template>
      </p>
    </template>

    <template v-else-if="!complete">
      <div class="goal-subgoal-row is-static">
        <img class="goal-subgoal-icon" :src="iconFor(skill)" alt="" width="16" height="16" decoding="async" />
        <span class="goal-subgoal-name">{{ skill!.name }}</span>
        <button
          type="button"
          class="goal-card-focus"
          :class="{ 'is-focused': isFocused }"
          :aria-pressed="isFocused"
          :title="isFocused ? 'Unfocus this goal' : 'Focus this goal'"
          @click="emit('focus', goal.id)"
        >
          <svg class="goal-card-focus-icon" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
            <circle cx="9" cy="6.2" r="4.2" />
            <polygon points="6.2,9.6 11.8,9.6 9,17" />
          </svg>
          <span class="visually-hidden">{{ isFocused ? 'Unfocus' : 'Focus' }} this goal</span>
        </button>
        <SkillProgressRow
          :goal="goal"
          :skill="skill"
          :start-value="startValueOf(goal)"
          :current-value="skillProgress!.currentValue"
          :target-value="goal.targetValue"
          :fraction="skillProgress!.fraction"
          :can-edit="canEdit"
          :show-label="false"
          @delete="emit('delete', goal.id)"
        />
      </div>
      <div v-if="(goal.labels ?? []).length" class="goal-card-labels">
        <span v-for="name in goal.labels" :key="name" class="goal-card-label">
          <span class="swatch" :style="{ '--swatch': labelsByName.get(name) ?? DEFAULT_LABEL_COLOUR }" aria-hidden="true" />
          <span class="goal-card-label-name">{{ name }}</span>
        </span>
      </div>
    </template>

    <template v-else>
      <div class="goal-card-head">
        <img class="goal-card-icon" :src="iconFor(skill)" alt="" width="18" height="18" decoding="async" />
        <span class="goal-card-name">{{ skill!.name }}</span>
        <button
          type="button"
          class="goal-card-focus"
          :class="{ 'is-focused': isFocused }"
          :aria-pressed="isFocused"
          :title="isFocused ? 'Unfocus this goal' : 'Focus this goal'"
          @click="emit('focus', goal.id)"
        >
          <svg class="goal-card-focus-icon" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
            <circle cx="9" cy="6.2" r="4.2" />
            <polygon points="6.2,9.6 11.8,9.6 9,17" />
          </svg>
          <span class="visually-hidden">{{ isFocused ? 'Unfocus' : 'Focus' }} this goal</span>
        </button>
        <span class="goal-card-target">✓ {{ goalTargetLabel(goal) }}</span>
        <button v-if="canEdit" type="button" class="goal-card-delete" aria-label="Delete this goal" @click="emit('delete', goal.id)">×</button>
      </div>
      <div v-if="(goal.labels ?? []).length" class="goal-card-labels">
        <span v-for="name in goal.labels" :key="name" class="goal-card-label">
          <span class="swatch" :style="{ '--swatch': labelsByName.get(name) ?? DEFAULT_LABEL_COLOUR }" aria-hidden="true" />
          <span class="goal-card-label-name">{{ name }}</span>
        </span>
      </div>
      <p v-if="metaParts" class="goal-card-meta">
        <template v-for="(part, i) in metaParts" :key="i"><span v-if="i > 0" aria-hidden="true"> · </span><span>{{ part }}</span></template>
      </p>
    </template>

    <ul v-if="isQuest && orderedChildren.length" class="goal-subgoals">
      <li
        v-for="child in orderedChildren"
        :key="child.id"
        class="goal-subgoal-row"
        :class="{ 'is-complete': child.completedAt, 'is-focused': child.id === focusedId }"
        @click="focusClick(child.id, $event)"
      >
        <SkillProgressRow
          :goal="child"
          :skill="bySkillId.get(child.skillId)"
          :start-value="startValueOf(child)"
          :current-value="childProgress(child).currentValue"
          :target-value="child.targetValue"
          :fraction="childProgress(child).fraction"
          :can-edit="canEdit"
          @delete="emit('delete', child.id)"
        />
      </li>
    </ul>
  </li>
</template>
