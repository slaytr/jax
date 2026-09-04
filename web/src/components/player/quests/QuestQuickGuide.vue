<script setup lang="ts">
import { WIKI_ICON } from '@shared/config.js';
import { questWikiUrl } from '@shared/quest-goal.js';
import type { QuestGuide } from '@/lib/questGuide';
import { useQuestGuideCompletion } from '@/composables/useQuestGuideCompletion';
import QuestGuideStepList from '@/components/player/quests/QuestGuideStepList.vue';

/**
 * The Quests tab's quick-guide view (QuestDependencyGraph.vue's own
 * map/guide toggle) — one quest's steps at a time, read straight off
 * `guide` rather than re-fetching anything itself; `guide` is null both
 * while nothing's loaded yet and when this quest genuinely has no entry in
 * quest-guides.json (useQuestGuides.ts/QuestDependencyGraph.vue tell those
 * two apart before ever mounting this with a `quest`), so the empty state
 * below reads the same either way — there's no guide to show.
 *
 * Owns useQuestGuideCompletion.ts itself (keyed to `playerSlug`) rather
 * than QuestDependencyGraph.vue instantiating it — this is the only
 * consumer, and every QuestGuideStepList.vue at every nesting depth needs
 * the exact same isCompleted/toggle pair, not its own copy, so it's built
 * once here and threaded down instead.
 *
 * A section's own screenshots (only ~108 of the 283 covered quests have
 * any — the later of quest-guides.json's two merged scrapes) render as
 * plain `<img>`s straight off the wiki's own CDN, not downloaded into this
 * app anywhere — width/height are the real image's own, set inline so the
 * layout doesn't jump once each one finishes loading.
 */
const props = defineProps<{ quest: any; guide: QuestGuide | null; playerSlug: string }>();

const { isCompleted, toggle } = useQuestGuideCompletion(props.playerSlug);
</script>

<template>
  <div class="quest-guide">
    <div class="quest-guide-head">
      <h3 class="quest-guide-title">{{ quest.name }}</h3>
      <a
        class="goal-card-wiki-link"
        :href="questWikiUrl(quest.name)"
        target="_blank"
        rel="noopener noreferrer"
        :aria-label="`Open ${quest.name} on the wiki`"
        title="Open on the wiki"
      >
        <img :src="WIKI_ICON" alt="" width="13" height="13" decoding="async" />
      </a>
    </div>

    <p v-if="!guide" class="chart-empty">No quick guide yet for "{{ quest.name }}" — try the wiki link above instead.</p>
    <template v-else>
      <div v-if="guide.itemsRequired.length > 0" class="quest-guide-items">
        <p class="quest-guide-items-label">Items needed</p>
        <ul>
          <li v-for="item in guide.itemsRequired" :key="item">{{ item }}</li>
        </ul>
      </div>

      <div v-for="(section, i) in guide.sections" :key="i" class="quest-guide-section">
        <h4 class="quest-guide-heading">{{ section.heading }}</h4>
        <p v-if="section.needed" class="quest-guide-section-tag"><span>Needed:</span> {{ section.needed }}</p>
        <p v-if="section.recommended" class="quest-guide-section-tag"><span>Recommended:</span> {{ section.recommended }}</p>
        <ul v-if="section.notes.length > 0" class="quest-guide-section-notes">
          <li v-for="(note, j) in section.notes" :key="j">{{ note }}</li>
        </ul>
        <QuestGuideStepList :steps="section.steps" :quest-name="quest.name" :path="[i]" :is-completed="isCompleted" :on-toggle="toggle" />
        <div v-if="section.screenshots.length > 0" class="quest-guide-screenshots">
          <a v-for="(shot, k) in section.screenshots" :key="k" :href="shot.src" target="_blank" rel="noopener noreferrer" title="Open full size">
            <img :src="shot.src" :width="shot.width" :height="shot.height" loading="lazy" decoding="async" alt="" />
          </a>
        </div>
      </div>
    </template>
  </div>
</template>
