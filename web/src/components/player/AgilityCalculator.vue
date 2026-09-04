<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { WIKI_ICON } from '@shared/config.js';
import { formatNumber } from '@shared/format.js';
import { levelForXp, xpForLevel } from '@shared/xp-table.js';
import {
  AGILITY_SKILL,
  agilityOptions,
  bestAt,
  buildRoute,
  formatHours,
  optimalSwitches,
  planAgility,
  unlocksInRange,
  type AgilityOption,
} from '@/lib/agilityCalculator';

/**
 * The Agility XP calculator — CalculatorPanel.vue's only working skill so
 * far (agility-courses.js is the only one with real course data behind it;
 * everything else in the picker stays disabled until it gets the same
 * treatment). Current level/xp comes straight off `player`; the target
 * defaults to whatever active Agility goal the player already has set
 * (GoalsGraph.vue's own lookup, passed in as `existingGoal`) so the two
 * stay in step rather than asking a viewer to re-enter a number they've
 * already set once, but every field here stays freely editable — this is a
 * what-if calculator, not the goal dialog, so nothing here writes back to
 * that goal.
 *
 * The route itself is a real choice, not just a readout: a dropdown for
 * the course to start on, then one more per level where anything at all
 * unlocks between here and the target — not just the ones that'd actually
 * be worth switching to (unlocksInRange, not optimalSwitches) — each
 * defaulting to the fastest option there (optimalSwitches again, this time
 * as a starting point rather than the final word) but freely reassignable
 * to a slower course, or to "keep current" to skip a level's own unlock
 * entirely. buildRoute turns whatever's actually selected into the
 * resulting hours/laps per leg; nothing here second-guesses that choice
 * the way the old fully-automatic version did.
 *
 * "Add to graph" (`saveRoute`) emits the chosen route + target upward
 * (CalculatorPanel.vue, then GoalsGraph.vue, which actually creates the
 * node) rather than saving anything itself — this component has no id for
 * the node it'd be creating, and no access to the canvas to place it on.
 */
const props = defineProps<{
  player: { skillById?: Record<number, { level: number; xp: number }> };
  existingGoal: any | null;
}>();

const emit = defineEmits<{
  save: [
    route: {
      skillId: number;
      targetType: 'level' | 'xp';
      targetValue: number;
      startOptionLabel: string;
      switchLabels: string[];
      startLevel: number;
      startXp: number;
    },
  ];
}>();

const options = agilityOptions();

const value = computed(() => props.player.skillById?.[AGILITY_SKILL.id] ?? { level: 1, xp: 0 });
const maxed = computed(() => value.value.level >= AGILITY_SKILL.max);
const nextLevel = computed(() => Math.min(value.value.level + 1, AGILITY_SKILL.max));

function initialTargetType(): 'level' | 'xp' {
  if (props.existingGoal) return props.existingGoal.targetType;
  return maxed.value ? 'xp' : 'level';
}

function initialLevel(): number {
  if (props.existingGoal?.targetType === 'level') return props.existingGoal.targetValue;
  if (props.existingGoal?.targetType === 'xp') return levelForXp(AGILITY_SKILL, props.existingGoal.targetValue);
  return maxed.value ? AGILITY_SKILL.max : nextLevel.value;
}

function initialXp(): number {
  if (props.existingGoal?.targetType === 'xp') return props.existingGoal.targetValue;
  if (props.existingGoal?.targetType === 'level') return xpForLevel(AGILITY_SKILL, props.existingGoal.targetValue) ?? value.value.xp;
  return xpForLevel(AGILITY_SKILL, nextLevel.value) ?? value.value.xp + 100000;
}

const targetType = ref<'level' | 'xp'>(initialTargetType());
const levelInput = ref(initialLevel());
const xpInput = ref(initialXp());

function onLevelInput() {
  const level = Math.trunc(levelInput.value);
  if (!Number.isFinite(level) || level < 1) return;
  const xp = xpForLevel(AGILITY_SKILL, Math.min(level, AGILITY_SKILL.max));
  if (xp !== undefined) xpInput.value = xp;
}

function onXpInput() {
  const xp = Number(xpInput.value);
  if (!Number.isFinite(xp) || xp < 0) return;
  levelInput.value = levelForXp(AGILITY_SKILL, xp);
}

const startOptions = computed(() => unlocksInRange(0, value.value.level, options));
const levelGroups = computed(() => {
  const groups: { level: number; options: AgilityOption[] }[] = [];
  for (const option of unlocksInRange(value.value.level, levelInput.value, options)) {
    const group = groups.at(-1);
    if (group && group.level === option.levelRequirement) group.options.push(option);
    else groups.push({ level: option.levelRequirement, options: [option] });
  }
  return groups;
});

const startLabel = ref('');
const chosen = ref<Record<number, string>>({});

/** Fills in a sensible default (optimalSwitches' own pick) for the
 * starting course and any level that doesn't have a selection yet, and
 * drops selections for levels the current level/target no longer spans —
 * runs on mount and whenever either boundary moves, but never overwrites a
 * choice for a level still in range: retyping a target shouldn't silently
 * undo a switch a viewer picked for a level still on the route. */
function fillDefaults() {
  if (!startOptions.value.some((option) => option.label === startLabel.value)) {
    startLabel.value = bestAt(options, value.value.level)?.label ?? startOptions.value[0]?.label ?? '';
  }

  const validLevels = new Set(levelGroups.value.map((group) => group.level));
  for (const level of Object.keys(chosen.value).map(Number)) {
    if (!validLevels.has(level)) delete chosen.value[level];
  }

  const recommended = new Map(optimalSwitches(value.value.level, levelInput.value, options).map((option) => [option.levelRequirement, option.label]));
  for (const group of levelGroups.value) {
    if (!(group.level in chosen.value)) chosen.value[group.level] = recommended.get(group.level) ?? '';
  }
}

watch([levelInput, () => value.value.level], fillDefaults, { immediate: true });

/** The "use recommended" action — same defaults fillDefaults hands out to
 * a level that's never had a choice, just forced over whatever's there
 * now instead of only filling gaps. */
function useRecommended() {
  startLabel.value = '';
  chosen.value = {};
  fillDefaults();
}

const startOption = computed<AgilityOption | null>(() => options.find((option) => option.label === startLabel.value) ?? null);

const switches = computed<AgilityOption[]>(() =>
  levelGroups.value
    .map((group) => group.options.find((option) => option.label === chosen.value[group.level]))
    .filter((option): option is AgilityOption => !!option),
);

const route = computed(() =>
  startOption.value ? buildRoute(value.value.level, value.value.xp, levelInput.value, xpInput.value, startOption.value, switches.value) : [],
);
const totalHours = computed(() => route.value.reduce((sum, segment) => sum + segment.hours, 0));
const segmentsByFromLevel = computed(() => new Map(route.value.map((segment) => [segment.fromLevel, segment])));

/** What the fully-automatic route would be for this same current level/xp
 * and target — not shown unless `route` above actually differs from it
 * (same courses, same order), so picking "keep current" or a slower
 * course on purpose doesn't just silently hide how much it costs. */
const optimalPlan = computed(() => planAgility(value.value.level, value.value.xp, levelInput.value, xpInput.value, options));
const isOptimalRoute = computed(() => {
  const chosenLabels = route.value.map((segment) => segment.option.label);
  const optimalLabels = optimalPlan.value.segments.map((segment) => segment.option.label);
  return chosenLabels.length === optimalLabels.length && chosenLabels.every((label, i) => label === optimalLabels[i]);
});

/** "139 laps"/"1 lap" — a segment with no per-lap figure of its own
 * (Brimhaven's ticket mechanic) just reads as no laps line at all rather
 * than a bare "—". */
function formatLaps(count: number | null): string | null {
  return count === null ? null : `${formatNumber(count)} lap${count === 1 ? '' : 's'}`;
}

/** GoalsGraph.vue's own `onSaveCalculatorRoute` turns this into a real
 * GoalGraphCalculatorNode — everything it needs to rebuild the exact same
 * route later, nothing that's only true right now (see
 * useGoalGraphCalculatorNodes.ts's own doc comment on why the player's
 * current level/xp is deliberately not part of this). */
function saveRoute() {
  if (!startOption.value) return;
  emit('save', {
    skillId: AGILITY_SKILL.id,
    targetType: targetType.value,
    targetValue: targetType.value === 'level' ? levelInput.value : xpInput.value,
    startOptionLabel: startOption.value.label,
    switchLabels: switches.value.map((option) => option.label),
    startLevel: value.value.level,
    startXp: value.value.xp,
  });
}
</script>

<template>
  <div class="agility-calculator">
    <p class="calculator-panel-current">Currently level {{ formatNumber(value.level) }} ({{ formatNumber(value.xp) }} xp)</p>

    <p v-if="existingGoal" class="calculator-panel-hint">Filled in from your existing Agility goal — change it freely, this won't touch that goal.</p>

    <label class="calculator-target-choice">
      <input type="radio" name="agility-target-type" value="level" v-model="targetType" :disabled="maxed" />
      <span>Level</span>
      <input
        type="number"
        :min="value.level + 1"
        :max="AGILITY_SKILL.max"
        step="1"
        v-model.number="levelInput"
        :disabled="targetType !== 'level'"
        @input="onLevelInput"
      />
    </label>
    <label class="calculator-target-choice">
      <input type="radio" name="agility-target-type" value="xp" v-model="targetType" />
      <span>XP</span>
      <input type="number" :min="value.xp + 1" step="1" v-model.number="xpInput" :disabled="targetType !== 'xp'" @input="onXpInput" />
    </label>

    <div v-if="startOption" class="calculator-route">
      <div class="calculator-route-head">
        <p class="calculator-panel-hint calculator-route-title">Your route</p>
        <button type="button" class="calculator-route-reset" @click="useRecommended">Use optimal route</button>
      </div>

      <p class="calculator-plan-eta calculator-route-total">Your route: {{ formatHours(totalHours) }}</p>
      <p v-if="!isOptimalRoute" class="calculator-route-optimal">Optimal route: {{ formatHours(optimalPlan.hoursRemaining) }}</p>

      <div class="calculator-route-step">
        <div class="calculator-route-step-row">
          <span class="calculator-route-step-level">{{ value.level }}</span>
          <select v-model="startLabel" class="calculator-route-select">
            <option v-for="option in startOptions" :key="option.label" :value="option.label">{{ option.label }}</option>
          </select>
          <a :href="startOption.wikiUrl" target="_blank" rel="noopener" title="View on the wiki" class="calculator-route-wiki">
            <img :src="WIKI_ICON" alt="" width="12" height="12" decoding="async" />
          </a>
        </div>
        <p class="calculator-route-step-stats">
          {{ formatNumber(startOption.xpPerHour) }} xp/hr<template v-if="route[0] && formatLaps(route[0].laps)"> | {{ formatLaps(route[0].laps) }} to go</template>
        </p>
      </div>

      <div v-for="group in levelGroups" :key="group.level" class="calculator-route-step">
        <div class="calculator-route-step-row">
          <span class="calculator-route-step-level">{{ group.level }}</span>
          <select v-model="chosen[group.level]" class="calculator-route-select">
            <option value="">Keep current course</option>
            <option v-for="option in group.options" :key="option.label" :value="option.label">{{ option.label }}</option>
          </select>
          <a
            v-if="chosen[group.level]"
            :href="group.options.find((option) => option.label === chosen[group.level])?.wikiUrl"
            target="_blank"
            rel="noopener"
            title="View on the wiki"
            class="calculator-route-wiki"
          >
            <img :src="WIKI_ICON" alt="" width="12" height="12" decoding="async" />
          </a>
        </div>
        <p v-if="group.options.find((option) => option.label === chosen[group.level])" class="calculator-route-step-stats">
          {{ formatNumber(group.options.find((option) => option.label === chosen[group.level])!.xpPerHour) }} xp/hr<template
            v-if="segmentsByFromLevel.get(group.level) && formatLaps(segmentsByFromLevel.get(group.level)!.laps)"
          >
            | {{ formatLaps(segmentsByFromLevel.get(group.level)!.laps) }} to go</template
          >
        </p>
      </div>

      <button type="button" class="calculator-route-save" title="Save this route to the graph" @click="saveRoute">
        <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
          <path d="M9 3.5v11M3.5 9h11" />
        </svg>
        <span>Add to graph</span>
      </button>
    </div>
  </div>
</template>
