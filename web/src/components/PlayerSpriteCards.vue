<script setup lang="ts">
import { computed } from 'vue';

import { TRACKED_SKILLS, iconFor } from '@shared/config.js';
import { formatCompact } from '@shared/format.js';
import PixelSprite from '@/components/PixelSprite.vue';
import { playerActivities } from '@/lib/playerActivity';
import { PLAYER_SPRITES, skillSpritesFor, stateSpritesFor, type PlayerSprite } from '@/lib/playerSprites';
import { HEIGHT, WIDTH, type SpriteStep } from '@/lib/skillSprites';

/**
 * One card per player, animating whatever they're up to today: their
 * biggest-XP skill, else sleeping, else (two quiet days) on vacation. See
 * playerActivity.ts for the rules; the sprites come from the /sprites
 * playground's playerSprites.ts.
 */
const props = defineProps<{ snapshots: any[]; players: any[] }>();

const STATE_LABELS = { sleeping: 'Sleeping', vacation: 'On vacation' } as const;

interface Card {
  player: any;
  sprite: PlayerSprite;
  steps: SpriteStep[];
  skill: { slug: string; name: string } | null;
  label: string;
}

const cards = computed(() => {
  const activities = playerActivities(props.snapshots, props.players);
  return props.players.flatMap((player): Card[] => {
    const sprite = PLAYER_SPRITES.find((candidate) => candidate.slug === player.slug);
    const activity = activities.find((candidate) => candidate.slug === player.slug);
    if (!sprite || !activity) return [];

    if (activity.kind === 'skill') {
      const skill = TRACKED_SKILLS.find((candidate: { id: number }) => candidate.id === activity.skillId);
      const animation = skill && skillSpritesFor(sprite).find((candidate) => candidate.id === skill.slug);
      if (skill && animation) {
        return [{ player, sprite, steps: animation.steps, skill, label: `${skill.name} · +${formatCompact(activity.xp)} xp` }];
      }
      // A skill with no animation yet falls through to sleeping rather than an empty card.
    }

    const state = activity.kind === 'vacation' ? 'vacation' : 'sleeping';
    const animation = stateSpritesFor(sprite).find((candidate) => candidate.id === state)!;
    return [{ player, sprite, steps: animation.steps, skill: null, label: STATE_LABELS[state] }];
  });
});
</script>

<template>
  <div class="sprite-cards">
    <article v-for="card in cards" :key="card.player.slug" class="sprite-card-mini" :style="{ '--accent': card.sprite.colour }">
      <div class="sprite-card-stage">
        <PixelSprite :steps="card.steps" :palette="card.sprite.palette" :width="WIDTH" :height="HEIGHT" :scale="4" />
      </div>
      <p class="sprite-card-name">{{ card.player.name }}</p>
      <p class="sprite-card-activity">
        <img v-if="card.skill" :src="iconFor(card.skill)" width="14" height="14" alt="" decoding="async" />
        <span class="sprite-card-label">{{ card.label }}</span>
      </p>
    </article>
  </div>
</template>
