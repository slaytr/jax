<script setup lang="ts">
import { computed } from 'vue';

import { formatNumber, formatCompact, formatSpan, formatRelativeTime } from '@shared/format.js';
import { iconFor, QUEST_POINTS_ICON, WIKI_ICON } from '@shared/config.js';
import { statusOf } from '@shared/quest-status.js';
import { questWikiUrl } from '@shared/quest-goal.js';
import {
  completedSkillStats,
  DEFAULT_LABEL_COLOUR,
  goalTargetLabel,
  orderByStatus,
  requiredQuestsFor,
  skillGoalProgress,
  startValueOf,
  type MetaPart,
} from '@/lib/goals';
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
  // The full quest-data list, just to resolve a quest goal's own slug for
  // its title's link to the Quests tab's quick guide (openGuide, below) —
  // same lazily-loaded prop GoalsList.vue already threads through for
  // GoalsGraph.vue's edges, null until the Goals tab has actually
  // requested it.
  quests: any[] | null;
  // Completed *standalone* skill goal ids the viewer has minimized — this
  // card's own id, never one of its nested requirement children (those have
  // no minimize toggle of their own). See isMinimized below.
  collapsedItems: Set<string>;
}>();

const emit = defineEmits<{ delete: [id: string]; openGuide: [slug: string]; toggleItem: [id: string] }>();

const COMPLETED_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const isQuest = computed(() => props.goal.kind === 'quest');
const skill = computed(() => (isQuest.value ? null : props.bySkillId.get(props.goal.skillId)));
const complete = computed(() => Boolean(props.goal.completedAt));
const orderedChildren = computed(() => orderByStatus(props.childGoals ?? []));

// Minimizing only ever applies to a *completed* skill goal — an active one
// has nothing worth hiding yet, and a quest goal's own card stays as-is
// (its checklist of children is what actually clutters up, not its own
// head/meta, and each child gets its own toggle below instead).
const isMinimized = computed(() => !isQuest.value && complete.value && props.collapsedItems.has(props.goal.id));

const questStatus = computed(() => {
  if (!isQuest.value) return null;
  const completedSet = new Set(props.player.completedQuests ?? []);
  const startedSet = new Set(props.player.startedQuests ?? []);
  return statusOf({ name: props.goal.questName }, completedSet, startedSet);
});

const skillProgress = computed(() => (isQuest.value ? null : skillGoalProgress(props.goal, skill.value, props.player, false)));

/** The quest goal's own direct prerequisite quests still outstanding
 * (requiredQuestsFor, distinct from orderedChildren above, which is its
 * skill-requirement goals), each with its live completion status — a
 * finished one is dropped, since it has nothing left to act on. Null while
 * `quests` hasn't loaded yet or once the goal itself is complete. */
const outstandingRequiredQuests = computed(() => {
  if (!isQuest.value) return null;
  return requiredQuestsFor(props.goal, props.quests, props.player)?.filter((req) => req.status !== 'completed') ?? null;
});

const REQUIRED_QUEST_STATUS_LABEL: Record<string, string> = {
  'in-progress': 'In progress',
  'not-started': 'Not started',
};

/** The slug the Quests tab's dependency map/guide keys off of (QuestsTab.vue,
 * QuestDependencyGraph.vue) — resolved by name since a quest goal only ever
 * stores `questName`. Null (rather than the card's title just not linking
 * anywhere) until `quests` itself has loaded. */
const questSlug = computed(() => (isQuest.value ? (props.quests?.find((quest) => quest.name === props.goal.questName)?.slug ?? null) : null));

/** Active skill goal has no meta line at all (matches the legacy card
 * exactly) — everything worth saying already sits in its progress row.
 * `stat: true` marks the figures actually worth a second look (levels/xp
 * gained, the daily rate) so the template can render those bolder than the
 * plain scheduling context (Completed/Took) sitting next to them. */
const metaParts = computed<MetaPart[] | null>(() => {
  if (isQuest.value) {
    if (complete.value) {
      return [
        { text: `Completed ${COMPLETED_DATE.format(new Date(props.goal.completedAt))}` },
        { text: `Took ${formatSpan(Date.parse(props.goal.completedAt) - Date.parse(props.goal.startedAt))}` },
      ];
    }
    return [{ text: `Started ${formatRelativeTime(props.goal.startedAt)}` }];
  }
  if (!complete.value) return null;
  const { startedMs, completedMs, levelsGained, xpGained, ratePerDay } = completedSkillStats(props.goal);
  return [
    { text: `Completed ${COMPLETED_DATE.format(new Date(completedMs))}` },
    { text: `+${formatNumber(levelsGained)} level${levelsGained === 1 ? '' : 's'}`, stat: true },
    { text: `+${formatNumber(xpGained)} xp`, stat: true },
    { text: `Took ${formatSpan(completedMs - startedMs)}` },
    { text: `${formatCompact(ratePerDay)} xp/day avg`, stat: true },
  ];
});

function childProgress(child: any) {
  return skillGoalProgress(child, props.bySkillId.get(child.skillId), props.player, true);
}
</script>

<template>
  <li class="goal-card" :class="{ 'is-complete': complete, 'is-minimized': isMinimized }">
    <template v-if="isQuest">
      <div class="goal-card-head">
        <img class="goal-card-icon" :src="QUEST_POINTS_ICON" alt="" width="18" height="18" decoding="async" />
        <button
          v-if="questSlug"
          type="button"
          class="goal-card-name goal-card-name-link"
          :title="`Open ${goal.questName}'s quick guide`"
          @click="emit('openGuide', questSlug)"
        >{{ goal.questName }}</button>
        <span v-else class="goal-card-name">{{ goal.questName }}</span>
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
        <template v-for="(part, i) in metaParts" :key="i"><span v-if="i > 0" aria-hidden="true"> · </span><span :class="{ 'goal-card-meta-stat': part.stat }">{{ part.text }}</span></template>
      </p>
    </template>

    <template v-else-if="!complete">
      <div class="goal-subgoal-row">
        <img class="goal-subgoal-icon" :src="iconFor(skill)" alt="" width="16" height="16" decoding="async" />
        <span class="goal-subgoal-name">{{ skill!.name }}</span>
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
        <span class="goal-card-target">✓ {{ goalTargetLabel(goal) }}</span>
        <span class="goal-card-head-spacer" />
        <button
          type="button"
          class="goal-card-minimize"
          :aria-expanded="isMinimized ? 'false' : 'true'"
          :title="isMinimized ? 'Expand this goal' : 'Minimize this goal'"
          @click="emit('toggleItem', goal.id)"
        >
          <span class="goal-card-minimize-chevron" aria-hidden="true" />
          <span class="visually-hidden">{{ isMinimized ? 'Expand' : 'Minimize' }} this goal</span>
        </button>
        <button v-if="canEdit" type="button" class="goal-card-delete" aria-label="Delete this goal" @click="emit('delete', goal.id)">×</button>
      </div>
      <div v-if="!isMinimized && (goal.labels ?? []).length" class="goal-card-labels">
        <span v-for="name in goal.labels" :key="name" class="goal-card-label">
          <span class="swatch" :style="{ '--swatch': labelsByName.get(name) ?? DEFAULT_LABEL_COLOUR }" aria-hidden="true" />
          <span class="goal-card-label-name">{{ name }}</span>
        </span>
      </div>
      <p v-if="!isMinimized && metaParts" class="goal-card-meta">
        <template v-for="(part, i) in metaParts" :key="i"><span v-if="i > 0" aria-hidden="true"> · </span><span :class="{ 'goal-card-meta-stat': part.stat }">{{ part.text }}</span></template>
      </p>
    </template>

    <ul v-if="isQuest && outstandingRequiredQuests && outstandingRequiredQuests.length" class="goal-subgoals goal-required-quests">
      <li
        v-for="req in outstandingRequiredQuests"
        :key="req.name"
        class="goal-required-quest-row"
      >
        <img class="goal-subgoal-icon" :src="QUEST_POINTS_ICON" alt="" width="16" height="16" decoding="async" />
        <span class="goal-required-quest-name">{{ req.name }}</span>
        <span class="goal-card-head-spacer" />
        <span class="goal-required-quest-status">{{ REQUIRED_QUEST_STATUS_LABEL[req.status] }}</span>
        <a
          class="goal-card-wiki-link"
          :href="questWikiUrl(req.name)"
          target="_blank"
          rel="noopener noreferrer"
          :aria-label="`Open ${req.name} quick guide on the wiki`"
          title="Quick guide (wiki)"
          @click.stop
        >
          <img :src="WIKI_ICON" alt="" width="14" height="14" decoding="async" />
        </a>
      </li>
    </ul>

    <ul v-if="isQuest && orderedChildren.length" class="goal-subgoals">
      <li
        v-for="child in orderedChildren"
        :key="child.id"
        class="goal-subgoal-row"
        :class="{ 'is-complete': child.completedAt }"
      >
        <SkillProgressRow
          :goal="child"
          :skill="bySkillId.get(child.skillId)"
          :start-value="startValueOf(child)"
          :current-value="childProgress(child).currentValue"
          :target-value="child.targetValue"
          :fraction="childProgress(child).fraction"
          :current-xp="childProgress(child).currentXp"
          :target-xp="childProgress(child).targetXp"
          :base-xp="childProgress(child).baseXp"
          :can-edit="canEdit"
          :show-delete="false"
        />
      </li>
    </ul>
  </li>
</template>
