<script setup lang="ts">
import { computed, reactive } from 'vue';

import { computeQuestPlan, subsequentQuests } from '@shared/quest-planner.js';
import { SKILLS, iconFor } from '@shared/config.js';

/**
 * The Quests tab's Planner — sits under the quest list/dependency map row,
 * advising what to work on next from three angles (computeQuestPlan,
 * quest-planner.js): quests with nothing at all left in the way ("Ready
 * now"), quests blocked only by a small skill gap ("Almost there"), and
 * questlines already underway. Ported from views/quest-planner.js.
 *
 * Every suggestion is clickable — a quest name anchors the dependency map
 * on it, a questline name anchors it on the whole series — so the planner
 * doubles as a shortcut into "why", not just a flat list of names.
 *
 * Renders nothing at all when every section is empty (a fresh or
 * fully-completed roster) rather than showing three empty-state messages.
 */
const props = defineProps<{ quests: any[]; player: any }>();
const emit = defineEmits<{ selectQuest: [quest: any]; selectSeries: [name: string] }>();

const SKILL_BY_NAME = new Map(SKILLS.map((skill: any) => [skill.name, skill]));

const plan = computed(() => computeQuestPlan(props.quests, props.player));
const isEmpty = computed(() => plan.value.readyNow.length === 0 && plan.value.almostThere.length === 0 && plan.value.questlines.length === 0);

function skillIcon(name: string) {
  const skill = SKILL_BY_NAME.get(name);
  return skill ? iconFor(skill) : null;
}

// Which "Ready now" rows currently have their forward chain (subsequentQuests)
// expanded — keyed by slug, same convention as the list's own :key. A plain
// reactive Set rather than per-row local state since the whole planner
// re-renders together whenever plan changes anyway.
const expandedSlugs = reactive(new Set<string>());

function toggleSubsequent(slug: string) {
  if (expandedSlugs.has(slug)) expandedSlugs.delete(slug);
  else expandedSlugs.add(slug);
}

const subsequentBySlug = computed(() => {
  const map = new Map<string, any[]>();
  for (const slug of expandedSlugs) {
    const candidate = plan.value.readyNow.find((entry: any) => entry.quest.slug === slug);
    if (candidate) map.set(slug, subsequentQuests(candidate.quest, props.quests, props.player));
  }
  return map;
});
</script>

<template>
  <section v-if="!isEmpty" class="lb quest-plan-card">
    <div class="lb-head"><div class="lb-title"><h2>Planner</h2></div></div>

    <div class="quest-plan-columns">
      <div class="quest-plan-section">
        <h3 class="quest-plan-heading">Ready now</h3>
        <p v-if="plan.readyNow.length === 0" class="quest-plan-empty">Nothing left in the way right now — check back after a level or two.</p>
        <ul v-else class="quest-plan-list">
          <li v-for="candidate in plan.readyNow" :key="candidate.quest.slug" class="quest-plan-item">
            <button type="button" class="quest-plan-name" :title="`Show ${candidate.quest.name}'s dependency chain`" @click="emit('selectQuest', candidate.quest)">{{ candidate.quest.name }}</button>
            <span v-if="candidate.unlocks > 0" class="quest-plan-unlocks" :title="`Unlocks ${candidate.unlocks} other quest${candidate.unlocks === 1 ? '' : 's'}`">→ {{ candidate.unlocks }}</span>
            <button
              type="button"
              class="quest-plan-expand-btn"
              :class="{ 'is-expanded': expandedSlugs.has(candidate.quest.slug) }"
              :aria-expanded="expandedSlugs.has(candidate.quest.slug)"
              :title="expandedSlugs.has(candidate.quest.slug) ? 'Hide what comes next' : 'Show what comes next after this quest'"
              @click="toggleSubsequent(candidate.quest.slug)"
            >{{ expandedSlugs.has(candidate.quest.slug) ? '–' : '+' }}</button>

            <ul v-if="expandedSlugs.has(candidate.quest.slug)" class="quest-plan-subsequent-list">
              <li v-if="(subsequentBySlug.get(candidate.quest.slug) ?? []).length === 0" class="quest-plan-empty">Nothing else opens up right behind this one yet.</li>
              <li v-for="next in subsequentBySlug.get(candidate.quest.slug)" :key="next.slug" class="quest-plan-subsequent-item">
                <button type="button" class="quest-plan-name" :title="`Show ${next.name}'s dependency chain`" @click="emit('selectQuest', next)">{{ next.name }}</button>
                <span v-if="next.series" class="quest-plan-subsequent-series">{{ next.series }}</span>
              </li>
            </ul>
          </li>
        </ul>
      </div>

      <div class="quest-plan-section">
        <h3 class="quest-plan-heading">Almost there</h3>
        <p v-if="plan.almostThere.length === 0" class="quest-plan-empty">No quest is currently just a small stat requirement away.</p>
        <ul v-else class="quest-plan-list">
          <li v-for="candidate in plan.almostThere" :key="candidate.quest.slug" class="quest-plan-item">
            <button type="button" class="quest-plan-name" :title="`Show ${candidate.quest.name}'s dependency chain`" @click="emit('selectQuest', candidate.quest)">{{ candidate.quest.name }}</button>
            <span class="quest-graph-node-skills">
              <span v-for="req in candidate.missingSkills" :key="req.skill" class="quest-graph-node-skill is-not-met" :title="`${req.skill} ${req.level}`">
                <img v-if="skillIcon(req.skill)" :src="skillIcon(req.skill)!" alt="" width="12" height="12" decoding="async" />
                <span>{{ req.level }}</span>
              </span>
            </span>
          </li>
        </ul>
      </div>
    </div>

    <div v-if="plan.questlines.length > 0" class="quest-plan-section">
      <h3 class="quest-plan-heading">Questlines in progress</h3>
      <ul class="quest-plan-list">
        <li v-for="line in plan.questlines" :key="line.series" class="quest-plan-item quest-plan-line-item">
          <button type="button" class="quest-plan-name" :title="`Show every quest in the ${line.series} series`" @click="emit('selectSeries', line.series)">
            {{ line.series }} {{ line.completedCount }}/{{ line.total }}
          </button>
          <span v-if="line.next" class="quest-plan-line-next">
            <span class="quest-plan-line-next-label">Next: </span>
            <button type="button" class="quest-plan-name quest-plan-line-next-name" :title="`Show ${line.next.quest.name}'s dependency chain`" @click="emit('selectQuest', line.next.quest)">
              {{ line.next.quest.name }}
            </button>
            <span v-if="line.next.missingSkills.length > 0" class="quest-graph-node-skills">
              <span v-for="req in line.next.missingSkills" :key="req.skill" class="quest-graph-node-skill is-not-met" :title="`${req.skill} ${req.level}`">
                <img v-if="skillIcon(req.skill)" :src="skillIcon(req.skill)!" alt="" width="12" height="12" decoding="async" />
                <span>{{ req.level }}</span>
              </span>
            </span>
          </span>
        </li>
      </ul>
    </div>
  </section>
</template>
