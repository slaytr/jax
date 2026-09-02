<script setup lang="ts">
import { computed } from 'vue';

import { el } from '@shared/dom.js';
import { formatCompact, formatNumber } from '@shared/format.js';
import { iconFor, QUEST_POINTS_ICON } from '@shared/config.js';
import { tooltipContent, vTooltip } from '@/lib/tooltipDirective';

const props = defineProps<{
  levels: { rows: any[] };
  xp: { rows: any[] };
  quests: { rows: any[] };
  // The slug currently leading each band, if they're also beating their
  // own total from the equivalent previous period — see hotSlugFor
  // (lib/gains.ts) for what "hot" means. Optional/nullable so a caller
  // that doesn't compute this (this component's own tests included) just
  // gets no ribbon rather than a required-prop error.
  hotLevelsSlug?: string | null;
  hotXpSlug?: string | null;
  hotQuestsSlug?: string | null;
  selectedPlayer: string | null;
}>();

const emit = defineEmits<{ select: [slug: string] }>();

const ORDINAL_SUFFIX = new Intl.PluralRules('en', { type: 'ordinal' });
const ORDINAL_SUFFIXES: Record<string, string> = { one: 'st', two: 'nd', few: 'rd', other: 'th' };
const ordinal = (n: number) => `${n}${ORDINAL_SUFFIXES[ORDINAL_SUFFIX.select(n)]}`;

/** Every row, ranked — a zero-gain row (`value <= 0`) still occupies its
 * column as a bare reserved slot (see the template's `v-else`) rather than
 * being omitted, so the grid's column count never reflows. */
const withPlace = (rows: any[], key: string) => rows.map((row, index) => ({ row, place: index + 1, value: row[key] }));

const levelRows = computed(() => withPlace(props.levels.rows, 'total'));
const xpRows = computed(() => withPlace(props.xp.rows, 'total'));
const questRows = computed(() => withPlace(props.quests.rows, 'gained'));

/** A skill's icon plus its gain — used both inline (top skill under the
 * headline value) and in the tooltip's per-skill breakdown grid. */
function skillGainNode(entry: { skill: any; gained: number }, className = 'skill-gain') {
  return el('span', { class: className }, [
    el('img', { src: iconFor(entry.skill), alt: '', width: 14, height: 14, decoding: 'async' }),
    el('span', { class: 'visually-hidden', text: `${entry.skill.name} ` }),
    el('span', { text: `+${formatCompact(entry.gained)}` }),
  ]);
}

function skillBreakdownExtra(bySkill: Array<{ skill: any; gained: number }>) {
  if (bySkill.length === 0) return null;
  return el('div', { class: 'tooltip-skills' }, [
    el('p', { class: 'tooltip-skills-label', text: 'Skills trained' }),
    el('div', { class: 'tooltip-skills-grid' }, bySkill.map((entry) => skillGainNode(entry))),
  ]);
}

function skillGainTooltip(row: any, valueLabel: string) {
  return () => {
    const top = row.bySkill[0];
    return tooltipContent(
      row.player.name,
      [
        [valueLabel, formatNumber(row.total)],
        ['Skills trained', formatNumber(row.bySkill.length)],
        ['Top skill', top ? skillGainNode(top, 'skill-gain is-top') : '—'],
      ],
      row.player.colour,
      skillBreakdownExtra(row.bySkill),
    );
  };
}

function questGainTooltip(row: any) {
  return () => tooltipContent(row.player.name, [['Quest points gained', formatNumber(row.gained)]], row.player.colour);
}
</script>

<template>
  <div class="lb-stack">
    <div class="lb-band">
      <div class="lb-band-head"><p class="lb-band-label">Levels</p></div>
      <div class="lb-row">
        <template v-for="{ row, place, value } in levelRows" :key="row.player.slug">
          <button
            v-if="value > 0"
            type="button"
            class="lb-entry"
            :class="{ 'is-selected': row.player.slug === selectedPlayer }"
            :style="{ '--accent': row.player.colour }"
            v-tooltip="skillGainTooltip(row, 'Levels gained')"
            @click="emit('select', row.player.slug)"
          >
            <span v-if="row.player.slug === hotLevelsSlug" class="lb-ribbon">Hot</span>
            <span class="visually-hidden">{{ ordinal(place) }} place —</span>
            <span class="lb-name">
              <span class="swatch" :style="{ '--swatch': row.player.colour }" aria-hidden="true" />
              <span>{{ row.player.name }}</span>
            </span>
            <span class="lb-value">
              <span>+{{ formatNumber(row.total) }}</span>
              <span v-if="row.bySkill[0]" class="lb-sub skill-gain">
                <img :src="iconFor(row.bySkill[0].skill)" alt="" width="14" height="14" decoding="async" />
                <span class="visually-hidden">{{ row.bySkill[0].skill.name }} </span>
                <span>+{{ formatCompact(row.bySkill[0].gained) }}</span>
              </span>
            </span>
          </button>
          <div v-else class="lb-entry lb-entry-empty" aria-hidden="true" />
        </template>
      </div>
    </div>

    <div class="lb-band">
      <div class="lb-band-head"><p class="lb-band-label">XP</p></div>
      <div class="lb-row">
        <template v-for="{ row, place, value } in xpRows" :key="row.player.slug">
          <button
            v-if="value > 0"
            type="button"
            class="lb-entry"
            :class="{ 'is-selected': row.player.slug === selectedPlayer }"
            :style="{ '--accent': row.player.colour }"
            v-tooltip="skillGainTooltip(row, 'XP gained')"
            @click="emit('select', row.player.slug)"
          >
            <span v-if="row.player.slug === hotXpSlug" class="lb-ribbon">Hot</span>
            <span class="visually-hidden">{{ ordinal(place) }} place —</span>
            <span class="lb-name">
              <span class="swatch" :style="{ '--swatch': row.player.colour }" aria-hidden="true" />
              <span>{{ row.player.name }}</span>
            </span>
            <span class="lb-value">
              <span>+{{ formatCompact(row.total) }}</span>
              <span v-if="row.bySkill[0]" class="lb-sub skill-gain">
                <img :src="iconFor(row.bySkill[0].skill)" alt="" width="14" height="14" decoding="async" />
                <span class="visually-hidden">{{ row.bySkill[0].skill.name }} </span>
                <span>+{{ formatCompact(row.bySkill[0].gained) }}</span>
              </span>
            </span>
          </button>
          <div v-else class="lb-entry lb-entry-empty" aria-hidden="true" />
        </template>
      </div>
    </div>

    <div class="lb-band">
      <div class="lb-band-head"><p class="lb-band-label">Quest points</p></div>
      <div class="lb-row">
        <template v-for="{ row, place, value } in questRows" :key="row.player.slug">
          <button
            v-if="value > 0"
            type="button"
            class="lb-entry"
            :class="{ 'is-selected': row.player.slug === selectedPlayer }"
            :style="{ '--accent': row.player.colour }"
            v-tooltip="questGainTooltip(row)"
            @click="emit('select', row.player.slug)"
          >
            <span v-if="row.player.slug === hotQuestsSlug" class="lb-ribbon">Hot</span>
            <span class="visually-hidden">{{ ordinal(place) }} place —</span>
            <span class="lb-name">
              <span class="swatch" :style="{ '--swatch': row.player.colour }" aria-hidden="true" />
              <span>{{ row.player.name }}</span>
            </span>
            <span class="lb-value">
              <span>+{{ formatNumber(row.gained) }}</span>
              <span class="lb-value-icon">
                <img :src="QUEST_POINTS_ICON" alt="" width="15" height="15" decoding="async" />
                <span class="visually-hidden">quest points</span>
              </span>
            </span>
          </button>
          <div v-else class="lb-entry lb-entry-empty" aria-hidden="true" />
        </template>
      </div>
    </div>
  </div>
</template>
