<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import { CALENDAR_DAY, computeLevelGains } from '@shared/compute.js';
import { SKILLS } from '@shared/config.js';
import SkillGrid from '@/components/player/SkillGrid.vue';
import PageTabs from '@/components/player/PageTabs.vue';
import PlayerGains from '@/components/player/gains/PlayerGains.vue';
import GoalsTab from '@/components/player/goals/GoalsTab.vue';
import QuestsTab from '@/components/player/quests/QuestsTab.vue';
import QuestList from '@/components/player/quests/QuestList.vue';
import { useGroupData } from '@/composables/useGroupData';
import { useQuests } from '@/composables/useQuests';
import { useStatsPageState, PAGE_TABS } from '@/composables/useStatsPageState';

const route = useRoute();
const { data } = useGroupData();
const statsState = useStatsPageState();

const slug = computed(() => String(route.params.slug));
const player = computed(() => data.value?.players.find((p: any) => p.slug === slug.value) ?? null);

const todayLevelGains = computed(() =>
  data.value ? computeLevelGains(data.value.snapshots, data.value.players, CALENDAR_DAY as any) : null,
);

// Clicking a skill-grid cell filters the Stats tab's Gains section down to
// that one skill; clicking the already-selected cell again clears it back
// to the combined total — same toggle-back-to-total shape as the
// comparison chart's own hidden/emphasized player toggles. Not persisted
// (in-memory only), and reset on a tab switch since it only means anything
// on the Stats tab — the Goals tab reuses this same grid for a different
// purpose, opening the new-goal dialog (handleGoalSkillSelect, below).
const selectedSkillId = ref<number | null>(null);
const selectedSkill = computed(() => SKILLS.find((skill: any) => skill.id === selectedSkillId.value) ?? null);

function handleSkillSelect(skillId: number) {
  selectedSkillId.value = selectedSkillId.value === skillId ? null : skillId;
}

// The Goals tab reuses the same skill grid for a different purpose: a
// click there opens the "new goal" dialog instead of filtering Gains.
// TEMP: no ownership gate here either — see useGoals.ts's own doc comment
// for the local-storage bypass this pairs with, and how to restore both
// together (an owner-only gate here, matching GoalsTab.vue's canEdit).
const newGoalSkillId = ref<number | null>(null);
function handleGoalSkillSelect(skillId: number) {
  newGoalSkillId.value = skillId;
}

// The Goals tab's own "Set Quest Goals" picker — QuestList.vue a second
// time (mode "pick-goal"), stacked under Set Skill Goals in the same
// sidebar column (.player-goals-sidebar, below), so a viewer doesn't have
// to switch to the Quests tab just to track one. Its own search/sort/filter
// state is local and unpersisted (not statsState.questSearch etc.) since
// it's a distinct compact "find a quest" utility here, not the same
// browsing experience as the full Quests tab. Quest data is the same
// ~340KB fetch that tab lazily requests — loaded here too, but only once
// the Goals tab is actually open (below), and loadQuests (quest-data.js)
// caches it either way so switching tabs never re-fetches.
const goalQuestSearch = ref('');
const goalQuestSort = ref('name');
const goalQuestStatusFilter = ref('all');
const goalQuestSkillReq = ref('all');
const newGoalQuest = ref<any | null>(null);
function handleGoalQuestSelect(quest: any) {
  newGoalQuest.value = quest;
}

const { quests: goalQuests, status: goalQuestsStatus, error: goalQuestsError, ensureLoaded: ensureGoalQuestsLoaded } = useQuests();
watch(
  () => statsState.tab,
  (tab) => {
    if (tab === 'goals') ensureGoalQuestsLoaded();
  },
  { immediate: true },
);

watch(
  () => statsState.tab,
  () => {
    selectedSkillId.value = null;
  },
);

watch(
  player,
  (value) => {
    if (value) document.title = `${value.name} · Jax`;
  },
  { immediate: true },
);
</script>

<template>
  <!-- A single root element per branch (not a <template> fragment of
       siblings) — App.vue wraps whichever route is showing in
       <Transition>, which requires exactly one root vnode; a multi-root
       fragment here silently renders nothing once wrapped in a real
       Transition (Vue only warns about it in dev builds). -->
  <div v-if="player" class="player-view">
    <!-- The player's own identity block (name, headline figures) lives in
         the persistent masthead above — see App.vue's activePlayer and
         TheMasthead.vue's own doc comment — since it's swapped in for the
         group's .topbar there instead of being repeated here. The activity
         calendar now lives under PlayerGains.vue's own bar-chart stack
         (Stats tab only) instead of riding here above every tab — see that
         component's own doc comment. -->
    <div class="page-tabs">
      <PageTabs v-model="statsState.tab" :tabs="PAGE_TABS" label="Player page section" />
    </div>

    <div v-if="statsState.tab === 'stats'" class="player-row">
      <SkillGrid :player="player" :today-level-gains="todayLevelGains" :selected-skill-id="selectedSkillId" @select="handleSkillSelect" />
      <PlayerGains :player="player" :players="data!.players" :snapshots="data!.snapshots" :selected-skill="selectedSkill" />
    </div>

    <div v-else-if="statsState.tab === 'quests'">
      <QuestsTab :player="player" :stats-state="statsState" />
    </div>

    <div v-else class="player-row">
      <div class="player-goals-sidebar">
        <SkillGrid :player="player" :today-level-gains="todayLevelGains" :selected-skill-id="null" title="Set Skill Goals" @select="handleGoalSkillSelect" />

        <QuestList
          :player="player"
          :quests="goalQuests"
          :status="goalQuestsStatus"
          :error="goalQuestsError"
          :search="goalQuestSearch"
          :sort="goalQuestSort"
          :status-filter="goalQuestStatusFilter"
          :skill-req="goalQuestSkillReq"
          :selected-quest-slug="null"
          title="Set Quest Goals"
          mode="pick-goal"
          @update:search="goalQuestSearch = $event"
          @update:sort="goalQuestSort = $event"
          @update:status-filter="goalQuestStatusFilter = $event"
          @update:skill-req="goalQuestSkillReq = $event"
          @select-quest="handleGoalQuestSelect"
        />
      </div>

      <GoalsTab
        :player="player"
        :stats-state="statsState"
        :new-goal-skill-id="newGoalSkillId"
        :new-goal-quest="newGoalQuest"
        :quests="goalQuests"
        @clear-new-goal-skill="newGoalSkillId = null"
        @clear-new-goal-quest="newGoalQuest = null"
      />
    </div>
  </div>

  <div v-else-if="data" class="empty empty-error">
    <p class="empty-title">No such player</p>
    <p class="empty-body">"{{ slug }}" isn't in {{ data.group.name }}'s current roster.</p>
    <p class="empty-body"><RouterLink to="/">Back to {{ data.group.name }}</RouterLink></p>
  </div>
</template>
