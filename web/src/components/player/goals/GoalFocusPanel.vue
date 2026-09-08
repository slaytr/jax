<script setup lang="ts">
import { computed } from 'vue';

import { formatNumber, formatCompact, formatSpan, formatRelativeTime } from '@shared/format.js';
import { iconFor, QUEST_POINTS_ICON, WIKI_ICON } from '@shared/config.js';
import { statusOf } from '@shared/quest-status.js';
import { questWikiUrl } from '@shared/quest-goal.js';
import { completedSkillStats, orderByStatus, skillGoalProgress, startValueOf, type MetaPart } from '@/lib/goals';
import SkillProgressRow from '@/components/player/goals/SkillProgressRow.vue';

/**
 * The Goals tab's own focus panel, above the filter and the list itself —
 * clicking any goal row/card picks it out to show in fuller detail than
 * its own compact row carries: an elapsed-time/rate/ETA readout for a
 * skill goal, or a quest's own full requirement checklist. Ported from
 * player-goals.js's renderFocusGoal. `goals` is the full, unfiltered list
 * — a nested requirement's own parent quest, and a quest's own requirement
 * siblings, are both found by scanning back through it.
 */
const props = defineProps<{
  goal: any;
  goals: any[];
  bySkillId: Map<number, any>;
  player: any;
  canEdit: boolean;
  focusedId: string | null;
}>();

const emit = defineEmits<{ focus: [id: string]; delete: [id: string]; clear: [] }>();

const COMPLETED_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const isQuest = computed(() => props.goal.kind === 'quest');
const complete = computed(() => Boolean(props.goal.completedAt));

const questStatus = computed(() => {
  if (!isQuest.value) return null;
  const completedSet = new Set(props.player.completedQuests ?? []);
  const startedSet = new Set(props.player.startedQuests ?? []);
  return statusOf({ name: props.goal.questName }, completedSet, startedSet);
});

const requirements = computed(() =>
  isQuest.value ? orderByStatus(props.goals.filter((other) => other.kind === 'skill' && other.group === props.goal.group)) : [],
);

const skill = computed(() => (isQuest.value ? null : props.bySkillId.get(props.goal.skillId)));
const parentQuest = computed(() =>
  !isQuest.value && props.goal.group ? (props.goals.find((other) => other.kind === 'quest' && other.group === props.goal.group) ?? null) : null,
);
const skillProgress = computed(() =>
  isQuest.value ? null : skillGoalProgress(props.goal, skill.value, props.player, Boolean(parentQuest.value)),
);

/** `stat: true` marks the figures actually worth a second look (levels/xp
 * gained, remaining, the daily rate, ETA) so the template can render those
 * bolder than the plain scheduling/baseline context sitting next to them
 * in the same line — see GoalCard.vue's own metaParts for the same split. */
const detailParts = computed<MetaPart[]>(() => {
  if (isQuest.value) {
    return complete.value
      ? [
          { text: `Completed ${COMPLETED_DATE.format(new Date(props.goal.completedAt))}` },
          { text: `Took ${formatSpan(Date.parse(props.goal.completedAt) - Date.parse(props.goal.startedAt))}` },
        ]
      : [{ text: `Started ${formatRelativeTime(props.goal.startedAt)}` }];
  }

  if (complete.value) {
    const { startedMs, completedMs, levelsGained, xpGained, ratePerDay } = completedSkillStats(props.goal);
    return [
      { text: `Completed ${COMPLETED_DATE.format(new Date(completedMs))}` },
      { text: `+${formatNumber(levelsGained)} level${levelsGained === 1 ? '' : 's'}`, stat: true },
      { text: `+${formatNumber(xpGained)} xp`, stat: true },
      { text: `Took ${formatSpan(completedMs - startedMs)}` },
      { text: `${formatCompact(ratePerDay)} xp/day avg`, stat: true },
    ];
  }

  const currentLevel = props.player.skillById?.[props.goal.skillId]?.level ?? props.goal.startLevel;
  const days = Math.max((Date.now() - Date.parse(props.goal.startedAt)) / 86400000, 1 / 24);
  const currentXp = skillProgress.value!.currentXp;
  const targetXp = skillProgress.value!.targetXp;
  const xpGained = currentXp - props.goal.startXp;
  const levelsGained = currentLevel - props.goal.startLevel;
  const ratePerDay = xpGained / days;
  const xpRemaining = Math.max(0, targetXp - currentXp);
  const etaDays = ratePerDay > 0 ? xpRemaining / ratePerDay : null;
  return [
    { text: `Started ${formatRelativeTime(props.goal.startedAt)}` },
    { text: `Start ${formatNumber(props.goal.startXp)} xp` },
    { text: `Current ${formatNumber(currentXp)} xp` },
    { text: `${formatNumber(xpRemaining)} xp to go`, stat: true },
    { text: `Target ${formatNumber(targetXp)} xp` },
    { text: `+${formatNumber(levelsGained)} level${levelsGained === 1 ? '' : 's'} so far`, stat: true },
    { text: `+${formatNumber(xpGained)} xp so far`, stat: true },
    { text: `${formatCompact(ratePerDay)} xp/day avg`, stat: true },
    etaDays !== null ? { text: `ETA ~${formatSpan(etaDays * 86400000)}`, stat: true } : { text: 'no progress yet' },
  ];
});

function focusClick(id: string, event: MouseEvent) {
  if ((event.target as HTMLElement).closest('button, a')) return;
  event.stopPropagation();
  emit('focus', id);
}

function childProgress(child: any) {
  return skillGoalProgress(child, props.bySkillId.get(child.skillId), props.player, true);
}
</script>

<template>
  <div class="goal-focus" :class="{ 'is-complete': complete }">
    <div class="goal-focus-head">
      <span class="goal-focus-eyebrow">Focus</span>
      <img class="goal-card-icon" :src="isQuest ? QUEST_POINTS_ICON : iconFor(skill)" alt="" width="18" height="18" decoding="async" />
      <span class="goal-card-name">{{ isQuest ? goal.questName : skill!.name }}</span>
      <a
        v-if="isQuest"
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
      <span v-if="isQuest" :class="complete ? 'goal-card-target' : 'goal-card-current'">
        {{ complete ? '✓ Completed' : questStatus === 'in-progress' ? 'In progress' : 'Not started' }}
      </span>
      <span v-else-if="parentQuest" class="goal-focus-context">Requirement for {{ parentQuest.questName }}</span>
      <span class="goal-card-head-spacer" />
      <button type="button" class="goal-card-delete" aria-label="Clear focus goal" @click="emit('clear')">×</button>
    </div>

    <template v-if="isQuest">
      <p class="goal-card-meta">
        <template v-for="(part, i) in detailParts" :key="i"><span v-if="i > 0" aria-hidden="true"> · </span><span :class="{ 'goal-card-meta-stat': part.stat }">{{ part.text }}</span></template>
      </p>
      <ul v-if="requirements.length" class="goal-subgoals">
        <li
          v-for="req in requirements"
          :key="req.id"
          class="goal-subgoal-row"
          :class="{ 'is-complete': req.completedAt, 'is-focused': req.id === focusedId }"
          @click="focusClick(req.id, $event)"
        >
          <SkillProgressRow
            :goal="req"
            :skill="bySkillId.get(req.skillId)"
            :start-value="startValueOf(req)"
            :current-value="childProgress(req).currentValue"
            :target-value="req.targetValue"
            :fraction="childProgress(req).fraction"
            :current-xp="childProgress(req).currentXp"
            :target-xp="childProgress(req).targetXp"
            :base-xp="childProgress(req).baseXp"
            :can-edit="canEdit"
            @delete="emit('delete', req.id)"
          />
        </li>
      </ul>
    </template>

    <template v-else>
      <div class="goal-subgoal-row" :class="{ 'is-focused': goal.id === focusedId }" @click="focusClick(goal.id, $event)">
        <SkillProgressRow
          :goal="goal"
          :skill="skill"
          :start-value="startValueOf(goal)"
          :current-value="skillProgress!.currentValue"
          :target-value="goal.targetValue"
          :fraction="skillProgress!.fraction"
          :current-xp="skillProgress!.currentXp"
          :target-xp="skillProgress!.targetXp"
          :base-xp="skillProgress!.baseXp"
          :can-edit="canEdit"
          :show-label="false"
          @delete="emit('delete', goal.id)"
        />
      </div>
      <p class="goal-card-meta">
        <template v-for="(part, i) in detailParts" :key="i"><span v-if="i > 0" aria-hidden="true"> · </span><span :class="{ 'goal-card-meta-stat': part.stat }">{{ part.text }}</span></template>
      </p>
    </template>
  </div>
</template>
