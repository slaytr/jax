<script setup lang="ts">
import { computed } from 'vue';

import { SKILL_GRID, iconFor } from '@shared/config.js';
import { formatNumber, formatRank } from '@shared/format.js';
import { xpForLevel, xpProgress } from '@shared/xp-table.js';
import { tooltipContent, vTooltip } from '@/lib/tooltipDirective';

/**
 * The 3×10 skill grid: RS3's own in-game skills-tab layout, one cell per
 * skill for this single player. Ported from player-skills.js — no per-row
 * "who's ahead" comparison (only one account here) and no visible gain
 * chip (gains live in the Gains section instead); the progress bar is
 * xpProgress toward the *next* level.
 *
 * Clicking a cell reports the skill id up (`select`) so the caller can
 * filter the Gains section to it — see PlayerView.vue's own
 * toggle-back-to-total handling, same shape as the comparison chart's
 * hidden/emphasized player toggles.
 */
const props = withDefaults(
  defineProps<{
    player: { slug: string; colour: string; skillById?: Record<number, any> };
    todayLevelGains: any;
    selectedSkillId: number | null;
    // "Skills" on the Stats tab, "Set Skill Goals" on the Goals tab
    // (PlayerView.vue) — same grid, same click-to-select behaviour either
    // way, just a different reason to click a cell.
    title?: string;
  }>(),
  { title: 'Skills' },
);

const emit = defineEmits<{ select: [skillId: number] }>();

const EMPTY_SKILL = Object.freeze({ level: 1, xp: 0, rank: null });

const bySlug = computed(() => props.todayLevelGains?.bySlug?.[props.player.slug]);

// SKILL_GRID has one `null` sentinel (bottom-right, RS3's own skills-tab
// layout leaves that slot empty) — dropped here rather than rendered, same
// as the legacy view's el() silently dropping a null child. 29 real cells
// across a 3-column grid naturally leave that same slot blank via ordinary
// grid auto-placement, so no placeholder element is needed to hold its spot.
const cells = computed(() =>
  SKILL_GRID.flat()
    .filter((skill: any) => skill !== null)
    .map((skill: any) => {
      const value = props.player.skillById?.[skill.id] ?? EMPTY_SKILL;
      return {
        skill,
        value,
        gainedToday: bySlug.value?.bySkill?.[skill.id] ?? 0,
        icon: iconFor(skill),
        isSelected: skill.id === props.selectedSkillId,
      };
    }),
);

function cellTooltip(cell: (typeof cells.value)[number]) {
  return () => {
    const { skill, value, gainedToday } = cell;
    const nextLevelXp = xpForLevel(skill, value.level + 1);
    return tooltipContent(skill.name, [
      ['Level', `${formatNumber(value.level)} / ${skill.max}`],
      ['Levels today', gainedToday > 0 ? `+${gainedToday}` : 'none'],
      ['Experience', `${formatNumber(value.xp)} xp`],
      ['Next level', nextLevelXp === undefined ? 'maxed' : `${formatNumber(Math.max(0, nextLevelXp - value.xp))} xp to go`],
      ['Rank', formatRank(value.rank)],
    ]);
  };
}
</script>

<template>
  <section class="lb" :style="{ '--accent': player.colour }">
    <div class="lb-head">
      <div class="lb-title"><h2>{{ title }}</h2></div>
    </div>
    <div class="skill-grid">
      <button
        v-for="cell in cells"
        :key="cell.skill.id"
        type="button"
        class="skill-cell"
        :class="{ 'is-empty': cell.value.xp === 0, 'is-selected': cell.isSelected }"
        :aria-pressed="cell.isSelected ? 'true' : 'false'"
        v-tooltip="cellTooltip(cell)"
        @click="emit('select', cell.skill.id)"
      >
        <img class="skill-cell-icon" :src="cell.icon" alt="" width="18" height="18" decoding="async" />
        <span class="visually-hidden">{{ cell.skill.name }} </span>
        <span class="cell-primary">{{ formatNumber(cell.value.level) }}</span>
        <span class="cell-rule" role="presentation">
          <span class="cell-rule-fill" :style="{ width: `${(xpProgress(cell.skill, cell.value.level, cell.value.xp) * 100).toFixed(1)}%` }" />
        </span>
      </button>
    </div>
  </section>
</template>
