<script setup lang="ts">
import { iconFor, WIKI_ICON } from '@shared/config.js';
import { questWikiUrl } from '@shared/quest-goal.js';
import type { QuestGuide } from '@/lib/questGuide';
import { parseRewardItem } from '@/lib/questReward';
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
 *
 * "Items needed" shares the exact same checkbox row as a step (itemId
 * below, same completed-set as every QuestGuideStepList.vue) rather than a
 * plain bullet — gathering supplies before setting out is as real a
 * checklist as the steps themselves. "Rewards" (questGuide.ts's own
 * `rewards`) is read-only underneath it — nothing to check off, just what
 * finishing this quest actually earns. A reward line that actually grants
 * skill xp (questReward.ts's own parseRewardItem) swaps that skill's own
 * name for its icon inline, same iconFor every skill icon on the site
 * already uses — a line that just happens to mention a skill without
 * granting it any xp ("Access to the Oo'glog Hunter area") is left as
 * plain text, same as parseRewardItem's own doc comment explains.
 */
const props = defineProps<{ quest: any; guide: QuestGuide | null; playerSlug: string }>();

const { isCompleted, toggle } = useQuestGuideCompletion(props.playerSlug);

/** An item's own id in useQuestGuideCompletion's shared completed-set —
 * `item.N` rather than a bare number, so it can't collide with
 * QuestGuideStepList.vue's own dot-joined numeric section/step paths. */
function itemId(index: number): string {
  return `${props.quest.name}::item.${index}`;
}
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
        <ul class="quest-guide-step-list">
          <li v-for="(item, i) in guide.itemsRequired" :key="item" class="quest-guide-step">
            <label class="quest-guide-step-row">
              <input type="checkbox" class="quest-guide-step-checkbox" :checked="isCompleted(itemId(i))" @change="toggle(itemId(i))" />
              <span class="quest-guide-step-text" :class="{ 'is-done': isCompleted(itemId(i)) }">{{ item }}</span>
            </label>
          </li>
        </ul>
      </div>

      <div v-if="guide.rewards.length > 0" class="quest-guide-rewards">
        <p class="quest-guide-items-label">Rewards</p>
        <div v-for="(group, i) in guide.rewards" :key="i" class="quest-guide-rewards-group">
          <p v-if="group.label" class="quest-guide-rewards-group-label">{{ group.label }}</p>
          <ul>
            <li v-for="(item, j) in group.items" :key="j">
              <template v-for="(part, k) in parseRewardItem(item)" :key="k">
                <img
                  v-if="part.type === 'skill'"
                  class="quest-guide-reward-skill-icon"
                  :src="iconFor(part.skill)"
                  :alt="part.skill.name"
                  :title="part.skill.name"
                  width="14"
                  height="14"
                  decoding="async"
                />
                <template v-else>{{ part.text }}</template>
              </template>
            </li>
          </ul>
        </div>
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
