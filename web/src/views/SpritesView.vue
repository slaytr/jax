<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { iconFor } from '@shared/config.js';
import PixelSprite from '@/components/PixelSprite.vue';
import { PLAYER_SPRITES, skillSpritesFor, stateSpritesFor } from '@/lib/playerSprites';
import { HEIGHT, WIDTH } from '@/lib/skillSprites';

/**
 * /sprites — a playground for the idea of animating each player gaining XP
 * on the home page. Pick a character in the tab strip and every skill's
 * animation plays for them; the selection rides in `?player=` so a link or
 * reload lands on the same character. Nothing here reads hiscore data: each
 * card just loops its sprite and, on the "action lands" frame, pops a +XP
 * and bumps a running total. `beats` is keyed per player+skill, and the pop
 * element is keyed on its count so it remounts (restarting its CSS
 * animation) on every hit.
 */
const route = useRoute();
const router = useRouter();

const selected = computed(
  () => PLAYER_SPRITES.find((player) => player.slug === route.query.player) ?? PLAYER_SPRITES[0],
);
const sprites = computed(() => skillSpritesFor(selected.value));
const states = computed(() => stateSpritesFor(selected.value));
const STATE_GLYPHS: Record<string, string> = { sleeping: '💤', vacation: '🏝️' };

const select = (slug: string) => {
  router.replace({ query: { ...route.query, player: slug } });
};

const showFrames = ref(false);

const beats = reactive<Record<string, number>>({});
const beatKey = (skillId: string) => `${selected.value.slug}:${skillId}`;
const onBeat = (skillId: string) => {
  const key = beatKey(skillId);
  beats[key] = (beats[key] ?? 0) + 1;
};
const beatCount = (skillId: string) => beats[beatKey(skillId)] ?? 0;
</script>

<template>
  <div class="sprites-view" :style="{ '--player': selected.colour }">
    <header class="sprites-head">
      <h1>Sprite playground</h1>
      <p>Pick a character to see them train every skill — the XP pop fires on each frame where the action lands.</p>
    </header>

    <div class="player-tabs" role="tablist" aria-label="Character">
      <button
        v-for="player in PLAYER_SPRITES"
        :key="player.slug"
        class="player-tab"
        :class="{ active: player.slug === selected.slug }"
        :style="{ '--tab-colour': player.colour }"
        role="tab"
        type="button"
        :aria-selected="player.slug === selected.slug"
        @click="select(player.slug)"
      >
        <span class="player-dot" aria-hidden="true" />
        {{ player.name }}
      </button>
    </div>

    <div class="sprites-toolbar">
      <h2 class="player-name">{{ selected.name }}</h2>
      <label class="frames-toggle">
        <input v-model="showFrames" type="checkbox" />
        Show frames
      </label>
    </div>

    <div :key="selected.slug" class="sprites-grid">
      <article v-for="sprite in sprites" :key="sprite.id" class="sprite-card">
        <h3>
          <img :src="iconFor({ slug: sprite.id })" alt="" width="16" height="16" decoding="async" />
          {{ sprite.name }}
        </h3>
        <div class="sprite-stage">
          <PixelSprite
            :steps="sprite.steps"
            :palette="selected.palette"
            :width="WIDTH"
            :height="HEIGHT"
            :scale="5"
            @beat="onBeat(sprite.id)"
          />
          <span v-if="beatCount(sprite.id) > 0" :key="beatCount(sprite.id)" class="xp-pop">+{{ sprite.xpPerBeat }} xp</span>
        </div>
        <p class="sprite-action">{{ sprite.action }}</p>
        <p class="sprite-total">{{ (beatCount(sprite.id) * sprite.xpPerBeat).toLocaleString() }} xp</p>
        <div v-if="showFrames" class="frame-strip">
          <PixelSprite
            v-for="(step, i) in sprite.steps"
            :key="i"
            :steps="[{ ...step, beat: false }]"
            :palette="selected.palette"
            :width="WIDTH"
            :height="HEIGHT"
            :scale="2"
          />
        </div>
      </article>
    </div>

    <div class="sprites-toolbar">
      <h2 class="section-title">Downtime</h2>
      <span class="section-note">Not skills — no XP</span>
    </div>

    <div :key="`${selected.slug}-states`" class="sprites-grid">
      <article v-for="state in states" :key="state.id" class="sprite-card">
        <h3>
          <span class="state-glyph" aria-hidden="true">{{ STATE_GLYPHS[state.id] }}</span>
          {{ state.name }}
        </h3>
        <div class="sprite-stage">
          <PixelSprite :steps="state.steps" :palette="selected.palette" :width="WIDTH" :height="HEIGHT" :scale="5" />
        </div>
        <p class="sprite-action">{{ state.action }}</p>
        <div v-if="showFrames" class="frame-strip">
          <PixelSprite
            v-for="(step, i) in state.steps"
            :key="i"
            :steps="[{ ...step, beat: false }]"
            :palette="selected.palette"
            :width="WIDTH"
            :height="HEIGHT"
            :scale="2"
          />
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.sprites-view {
  display: grid;
  gap: 1.25rem;
}
.sprites-head h1 {
  margin: 0 0 0.25rem;
}
.sprites-head p {
  margin: 0;
  color: var(--ink-2);
}

.player-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  border-bottom: 1px solid var(--surface-2);
}
.player-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: -1px;
  padding: 0.6rem 1rem;
  background: none;
  border: 1px solid transparent;
  border-bottom: 2px solid transparent;
  border-radius: 6px 6px 0 0;
  color: var(--ink-2);
  font: inherit;
  cursor: pointer;
}
.player-tab:hover {
  color: var(--ink);
  background: var(--surface-1);
}
.player-tab.active {
  color: var(--tab-colour);
  background: var(--surface-1);
  border-color: var(--surface-2);
  border-bottom-color: var(--tab-colour);
  font-weight: 600;
}
.player-tab:focus-visible {
  outline: 2px solid var(--tab-colour);
  outline-offset: 2px;
}
.player-dot {
  width: 0.65rem;
  height: 0.65rem;
  border-radius: 50%;
  background: var(--tab-colour);
}

.sprites-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}
.player-name {
  margin: 0;
  font-size: 1.15rem;
  color: var(--player);
}
.section-title {
  margin: 0;
  font-size: 1.05rem;
  color: var(--ink);
}
.section-note {
  color: var(--ink-muted);
  font-size: 0.85rem;
}
.state-glyph {
  font-size: 0.95rem;
}
.frames-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--ink-2);
  font-size: 0.85rem;
  cursor: pointer;
}

.sprites-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 0.75rem;
}
.sprite-card {
  background: var(--surface-1);
  border: 1px solid var(--surface-2);
  border-top: 3px solid var(--player);
  border-radius: 8px;
  padding: 0.75rem;
  text-align: center;
}
.sprite-card h3 {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  margin: 0 0 0.5rem;
  font-size: 0.9rem;
}
.sprite-action {
  margin: 0.4rem 0 0;
  color: var(--ink-muted);
  font-size: 0.8rem;
}
.sprite-total {
  margin: 0.2rem 0 0;
  color: var(--ink-2);
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
}
.frame-strip {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.25rem;
  margin-top: 0.5rem;
}
.sprite-stage {
  position: relative;
  background: var(--surface-0);
  border-radius: 6px;
  padding: 0.25rem;
}
.xp-pop {
  position: absolute;
  top: 0.2rem;
  right: 0.5rem;
  color: #f2c230;
  font-weight: 700;
  font-size: 0.8rem;
  text-shadow: 0 1px 0 #1b1410;
  pointer-events: none;
  animation: xp-rise 0.9s ease-out forwards;
}
@keyframes xp-rise {
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(-1.25rem);
  }
}
@media (prefers-reduced-motion: reduce) {
  .xp-pop {
    animation: none;
  }
}
</style>
