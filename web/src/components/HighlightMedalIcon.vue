<script setup lang="ts">
import { QUEST_POINTS_ICON, TOTAL_LEVEL_ICON } from '@shared/config.js';

/** The Ranker/Grind King/Quest God badge's own icon — pulled out of
 * HighlightsRow.vue's badge row so the "highlight just changed hands"
 * dialog (HighlightChangeDialog.vue) can show the exact same icon rather
 * than a second copy of this three-way branch drifting out of sync. */
defineProps<{ badgeKey: 'level' | 'xp' | 'quests' }>();
</script>

<template>
  <img v-if="badgeKey === 'level'" class="highlight-medal-icon is-photo" :src="TOTAL_LEVEL_ICON" alt="" width="22" height="22" decoding="async" />
  <svg v-else-if="badgeKey === 'xp'" class="highlight-medal-icon" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
    <polygon points="2,14 2,6 5.5,9.5 9,3.5 12.5,9.5 16,6 16,14" />
  </svg>
  <img v-else class="highlight-medal-icon is-photo" :src="QUEST_POINTS_ICON" alt="" width="22" height="22" decoding="async" />
</template>
