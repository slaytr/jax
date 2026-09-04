<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { WIKI_ICON } from '@shared/config.js';
import { formatNumber } from '@shared/format.js';
import { levelForXp, xpForLevel } from '@shared/xp-table.js';
import {
  FISHING_SKILL,
  bestAt,
  buildRoute,
  fishingOptions,
  formatHours,
  optimalSwitches,
  unlocksInRange,
  type FishingOption,
} from '@/lib/fishingCalculator';

/**
 * The Fishing XP calculator — CalculatorPanel.vue's second working skill
 * (fishing-methods.js is the data behind it, same "cross-checked against
 * the wiki, re-derive by hand if it changes" caveat as agility-courses.js).
 * Structurally identical to AgilityCalculator.vue — same current/target
 * fields, same explicit per-level route with freely reassignable switches,
 * same "Add to graph" save — see that component's own doc comment for the
 * full reasoning, none of it skill-specific.
 *
 * The one real difference from Agility worth calling out: a method's own
 * `xpPerHour` here is fishing-methods.js's own level-*99* figure, not a
 * level-independent constant the way an Agility course's is (Fishing's own
 * catch chance keeps climbing with level past a method's unlock). Every
 * hours/ETA figure this calculator shows is therefore an optimistic upper
 * bound below level 99, not an exact rate — see fishingCalculator.ts's own
 * doc comment on why nothing more precise is available to compute from.
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

const options = fishingOptions();

const value = computed(() => props.player.skillById?.[FISHING_SKILL.id] ?? { level: 1, xp: 0 });
const maxed = computed(() => value.value.level >= FISHING_SKILL.max);
const nextLevel = computed(() => Math.min(value.value.level + 1, FISHING_SKILL.max));

function initialTargetType(): 'level' | 'xp' {
  if (props.existingGoal) return props.existingGoal.targetType;
  return maxed.value ? 'xp' : 'level';
}

function initialLevel(): number {
  if (props.existingGoal?.targetType === 'level') return props.existingGoal.targetValue;
  if (props.existingGoal?.targetType === 'xp') return levelForXp(FISHING_SKILL, props.existingGoal.targetValue);
  return maxed.value ? FISHING_SKILL.max : nextLevel.value;
}

function initialXp(): number {
  if (props.existingGoal?.targetType === 'xp') return props.existingGoal.targetValue;
  if (props.existingGoal?.targetType === 'level') return xpForLevel(FISHING_SKILL, props.existingGoal.targetValue) ?? value.value.xp;
  return xpForLevel(FISHING_SKILL, nextLevel.value) ?? value.value.xp + 100000;
}

const targetType = ref<'level' | 'xp'>(initialTargetType());
const levelInput = ref(initialLevel());
const xpInput = ref(initialXp());

function onLevelInput() {
  const level = Math.trunc(levelInput.value);
  if (!Number.isFinite(level) || level < 1) return;
  const xp = xpForLevel(FISHING_SKILL, Math.min(level, FISHING_SKILL.max));
  if (xp !== undefined) xpInput.value = xp;
}

function onXpInput() {
  const xp = Number(xpInput.value);
  if (!Number.isFinite(xp) || xp < 0) return;
  levelInput.value = levelForXp(FISHING_SKILL, xp);
}

const startOptions = computed(() => unlocksInRange(0, value.value.level, options));
const levelGroups = computed(() => {
  const groups: { level: number; options: FishingOption[] }[] = [];
  for (const option of unlocksInRange(value.value.level, levelInput.value, options)) {
    const group = groups.at(-1);
    if (group && group.level === option.levelRequirement) group.options.push(option);
    else groups.push({ level: option.levelRequirement, options: [option] });
  }
  return groups;
});

const startLabel = ref('');
const chosen = ref<Record<number, string>>({});

/** Same defaulting behaviour as AgilityCalculator.vue's own fillDefaults —
 * see that one's doc comment. */
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

function useRecommended() {
  startLabel.value = '';
  chosen.value = {};
  fillDefaults();
}

const startOption = computed<FishingOption | null>(() => options.find((option) => option.label === startLabel.value) ?? null);

const switches = computed<FishingOption[]>(() =>
  levelGroups.value
    .map((group) => group.options.find((option) => option.label === chosen.value[group.level]))
    .filter((option): option is FishingOption => !!option),
);

const route = computed(() =>
  startOption.value ? buildRoute(value.value.level, value.value.xp, levelInput.value, xpInput.value, startOption.value, switches.value) : [],
);
const totalHours = computed(() => route.value.reduce((sum, segment) => sum + segment.hours, 0));
const segmentsByFromLevel = computed(() => new Map(route.value.map((segment) => [segment.fromLevel, segment])));

const optimalPlan = computed(() => {
  const initial = bestAt(options, value.value.level);
  if (!initial) return { hoursRemaining: 0, segments: [] as ReturnType<typeof buildRoute> };
  const optimalRoute = buildRoute(value.value.level, value.value.xp, levelInput.value, xpInput.value, initial, optimalSwitches(value.value.level, levelInput.value, options));
  return { hoursRemaining: optimalRoute.reduce((sum, segment) => sum + segment.hours, 0), segments: optimalRoute };
});
const isOptimalRoute = computed(() => {
  const chosenLabels = route.value.map((segment) => segment.option.label);
  const optimalLabels = optimalPlan.value.segments.map((segment) => segment.option.label);
  return chosenLabels.length === optimalLabels.length && chosenLabels.every((label, i) => label === optimalLabels[i]);
});

/** "139 catches"/"1 catch" — a segment with no per-catch figure of its own
 * (Fishing frenzy) just reads as no catches line at all rather than a
 * bare "—". */
function formatCatches(count: number | null): string | null {
  return count === null ? null : `${formatNumber(count)} catch${count === 1 ? '' : 'es'}`;
}

function saveRoute() {
  if (!startOption.value) return;
  emit('save', {
    skillId: FISHING_SKILL.id,
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

    <p v-if="existingGoal" class="calculator-panel-hint">Filled in from your existing Fishing goal — change it freely, this won't touch that goal.</p>
    <p class="calculator-panel-hint">Rates are each method's own xp/hr at level 99 — actual xp/hr below that will be lower.</p>

    <label class="calculator-target-choice">
      <input type="radio" name="fishing-target-type" value="level" v-model="targetType" :disabled="maxed" />
      <span>Level</span>
      <input
        type="number"
        :min="value.level + 1"
        :max="FISHING_SKILL.max"
        step="1"
        v-model.number="levelInput"
        :disabled="targetType !== 'level'"
        @input="onLevelInput"
      />
    </label>
    <label class="calculator-target-choice">
      <input type="radio" name="fishing-target-type" value="xp" v-model="targetType" />
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
          {{ formatNumber(startOption.xpPerHour) }} xp/hr<template v-if="route[0] && formatCatches(route[0].catches)"> | {{ formatCatches(route[0].catches) }} to go</template>
        </p>
      </div>

      <div v-for="group in levelGroups" :key="group.level" class="calculator-route-step">
        <div class="calculator-route-step-row">
          <span class="calculator-route-step-level">{{ group.level }}</span>
          <select v-model="chosen[group.level]" class="calculator-route-select">
            <option value="">Keep current method</option>
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
            v-if="segmentsByFromLevel.get(group.level) && formatCatches(segmentsByFromLevel.get(group.level)!.catches)"
          >
            | {{ formatCatches(segmentsByFromLevel.get(group.level)!.catches) }} to go</template
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
