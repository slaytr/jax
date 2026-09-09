<script setup lang="ts">
import { computed } from 'vue';

import { formatNumber, formatCompact, formatSpan, formatRelativeTime } from '@shared/format.js';
import { iconFor, QUEST_POINTS_ICON, WIKI_ICON } from '@shared/config.js';
import { statusOf } from '@shared/quest-status.js';
import { questWikiUrl } from '@shared/quest-goal.js';
import { completedSkillStats, DEFAULT_LABEL_COLOUR, goalTargetLabel, orderByStatus, skillGoalProgress, startValueOf, type MetaPart } from '@/lib/goals';
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
  // The full quest-data list, just to resolve a quest goal's own slug for
  // its title's link to the Quests tab's quick guide (openGuide, below) —
  // same lazily-loaded prop GoalsList.vue already threads through for
  // GoalsGraph.vue's edges, null until the Goals tab has actually
  // requested it.
  quests: any[] | null;
  // Completed goal ids the viewer has minimized — this card's own id (a
  // standalone skill goal) and/or any of its nested requirement children's
  // ids may be in here. See the minimize toggle below and orderByStatus's
  // own collapsedIds param (lib/goals.ts), which is what actually sinks a
  // minimized one below its still-expanded completed siblings.
  collapsedItems: Set<string>;
}>();

const emit = defineEmits<{ focus: [id: string]; delete: [id: string]; openGuide: [slug: string]; toggleItem: [id: string] }>();

const COMPLETED_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const isQuest = computed(() => props.goal.kind === 'quest');
const skill = computed(() => (isQuest.value ? null : props.bySkillId.get(props.goal.skillId)));
const complete = computed(() => Boolean(props.goal.completedAt));
const isFocused = computed(() => props.goal.id === props.focusedId);
const orderedChildren = computed(() => orderByStatus(props.childGoals ?? [], props.collapsedItems));

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
  <li class="goal-card" :class="{ 'is-complete': complete, 'is-focused': isFocused, 'is-minimized': isMinimized }">
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
        <button
          type="button"
          class="goal-card-focus"
          :class="{ 'is-focused': isFocused }"
          :aria-pressed="isFocused"
          :title="isFocused ? 'Unfocus this goal' : 'Focus this goal'"
          @click="emit('focus', goal.id)"
        >
          <svg class="goal-card-focus-icon" viewBox="0 0 384 512" aria-hidden="true" focusable="false">
            <path
              d="M32 32C32 14.3 46.3 0 64 0L320 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-29.5 0 11.4 148.2c36.7 19.9 65.7 53.2 79.5 94.7l1 3c3.3 9.8 1.6 20.5-4.4 28.8s-15.7 13.3-26 13.3L32 352c-10.3 0-19.9-4.9-26-13.3s-7.7-19.1-4.4-28.8l1-3c13.8-41.5 42.8-74.8 79.5-94.7L93.5 64 64 64C46.3 64 32 49.7 32 32zM160 384l64 0 0 96c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-96z"
            />
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
        <template v-for="(part, i) in metaParts" :key="i"><span v-if="i > 0" aria-hidden="true"> · </span><span :class="{ 'goal-card-meta-stat': part.stat }">{{ part.text }}</span></template>
      </p>
    </template>

    <template v-else-if="!complete">
      <div class="goal-subgoal-row is-static">
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

    <ul v-if="isQuest && orderedChildren.length" class="goal-subgoals">
      <li
        v-for="child in orderedChildren"
        :key="child.id"
        class="goal-subgoal-row"
        :class="{ 'is-complete': child.completedAt, 'is-focused': child.id === focusedId, 'is-minimized': collapsedItems.has(child.id) }"
        @click="focusClick(child.id, $event)"
      >
        <template v-if="child.completedAt && collapsedItems.has(child.id)">
          <img class="goal-subgoal-icon" :src="iconFor(bySkillId.get(child.skillId))" alt="" width="16" height="16" decoding="async" />
          <span class="goal-subgoal-name">{{ bySkillId.get(child.skillId)?.name }}</span>
          <span class="goal-card-head-spacer" />
          <span class="goal-subgoal-figures">✓ {{ formatNumber(child.targetValue) }}</span>
        </template>
        <SkillProgressRow
          v-else
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
          @delete="emit('delete', child.id)"
        />
        <button
          type="button"
          class="goal-card-minimize"
          :class="{ 'is-invisible': !child.completedAt }"
          :disabled="!child.completedAt"
          :tabindex="child.completedAt ? 0 : -1"
          :aria-hidden="!child.completedAt"
          :aria-expanded="collapsedItems.has(child.id) ? 'false' : 'true'"
          :title="collapsedItems.has(child.id) ? 'Expand this goal' : 'Minimize this goal'"
          @click="emit('toggleItem', child.id)"
        >
          <span class="goal-card-minimize-chevron" aria-hidden="true" />
          <span class="visually-hidden">{{ collapsedItems.has(child.id) ? 'Expand' : 'Minimize' }} this goal</span>
        </button>
      </li>
    </ul>
  </li>
</template>
