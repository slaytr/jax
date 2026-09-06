<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

import { WIKI_ICON, bossIconFor, itemIconFor } from '@shared/config.js';
import { useBossLoot } from '@/composables/useBossLoot';
import { rollItem } from '@/lib/bossLoot';
import type { StatsPageState } from '@/composables/useStatsPageState';

/**
 * The Loot tab — a reference browser for boss drop tables (boss-loot-tables.js,
 * loaded lazily via useBossLoot.ts), boss list on the left and that boss's
 * own drop table on the right, same two-column shape as the Tasks tab's
 * region/tier browser. Purely reference material: unlike Tasks' own
 * per-player completion checkmarks, nothing here is tied to this player's
 * account — the hiscores API this app is built on has no notion of what a
 * player has actually looted.
 *
 * Boss selection is round-tripped through `?boss=` (statsState.lootBossSlug)
 * rather than kept as local component state — same "a link to one specific
 * boss should actually reopen it" reasoning as the Tasks tab's own region/
 * tier and the Quests tab's questSlug.
 *
 * The loot simulator (killCount/roll below) is deliberately *not* part of
 * that persisted state, on purpose: it's a one-off "what if" roll, not a
 * reading preference or a link-shareable selection, and each Roll press is
 * meant to read as its own fresh batch of kills — see roll()'s own doc
 * comment for why it always throws away the previous results rather than
 * accumulating onto them.
 */
const props = defineProps<{ statsState: StatsPageState }>();

const { bosses, status, error, ensureLoaded } = useBossLoot();
onMounted(ensureLoaded);

const selectedBoss = computed(() => {
  if (!bosses.value) return null;
  return bosses.value.find((boss) => boss.slug === props.statsState.lootBossSlug) ?? bosses.value[0];
});

function selectBoss(boss: NonNullable<typeof selectedBoss.value>) {
  props.statsState.lootBossSlug = boss.slug;
}

const CATEGORY_LABELS: Record<string, string> = { Boss: 'Bosses', Monster: 'Monsters' };

/** The sidebar's own Bosses/Monsters split — grouped by first appearance in
 * boss-loot-tables.js (GWD1 bosses are listed before the monsters, so
 * Bosses always renders first) rather than a fixed category order, so a
 * future third category needs no change here. */
const groupedBosses = computed(() => {
  if (!bosses.value) return [];
  const groups: { category: string; label: string; entries: NonNullable<typeof bosses.value> }[] = [];
  for (const boss of bosses.value) {
    let group = groups.find((candidate) => candidate.category === boss.category);
    if (!group) {
      group = { category: boss.category, label: CATEGORY_LABELS[boss.category] ?? boss.category, entries: [] };
      groups.push(group);
    }
    group.entries.push(boss);
  }
  return groups;
});

const KILL_PRESETS = [1, 10, 50, 100, 250, 500];
const killCount = ref(100);

/** Keyed by `${sectionIndex}-${itemIndex}` rather than the item's own name
 * — several rows share a name across sections/bosses (Godsword shard 1,
 * Coins...), and a plain name key would collide and overwrite. `null`
 * until the first Roll; reset to `null` on every boss switch so a stale
 * result from a different boss's row layout can't get misread against
 * this one's. */
const results = ref<Record<string, { hits: number; qty: number }> | null>(null);
const rolledKills = ref(0);

watch(selectedBoss, () => {
  results.value = null;
});

/**
 * Re-rolls every simulatable row of the current boss from scratch — always
 * starting `results` back at an empty object rather than adding onto
 * whatever the previous press left there, so each click is its own
 * independent set of `killCount` trials rather than a running total across
 * clicks (asked for explicitly: pressing Roll again must not accumulate).
 */
function roll() {
  const boss = selectedBoss.value;
  if (!boss) return;

  const kills = Math.max(1, Math.min(1_000_000, Math.round(killCount.value) || 0));
  killCount.value = kills;

  const next: Record<string, { hits: number; qty: number }> = {};
  boss.sections.forEach((section, sectionIndex) => {
    section.items.forEach((item, itemIndex) => {
      const rolled = rollItem(item.rarity, item.quantity, kills);
      if (rolled) next[`${sectionIndex}-${itemIndex}`] = rolled;
    });
  });
  results.value = next;
  rolledKills.value = kills;
}

/** A boss's own Unique table (or, on Nex, its equivalent "Main drop" roll —
 * Nex has no section literally named Unique, but that 6/128 table is the
 * same kind of signature-item roll every other GWD1 boss's Unique section
 * is) — the section names the simulator's own purple border picks out for
 * most bosses. An individual item's own `unique: true` (Cave horror's
 * Black mask (10), filed under "Armour") covers the rest. */
function isUniqueSection(sectionName: string): boolean {
  return sectionName === 'Unique' || sectionName.startsWith('Main drop');
}

/** The simulator's own results strip — icon + total quantity obtained, one
 * chip per item that actually dropped at least once this roll. Reference
 * rows with no real item icon of their own (the Gem/Rare drop table
 * triggers, the two furniture-plan drops) are left out here — "just icon,
 * number" has nothing to show for those — even though they still count
 * toward the reference tables below. Ordered by the item's own position on
 * the boss's page (sectionIndex/itemIndex), not by count, so results read
 * top-to-bottom the same way the tables below do and don't reshuffle
 * between rolls. */
const simulatedDrops = computed(() => {
  const boss = selectedBoss.value;
  if (!results.value || !boss) return [];
  return Object.entries(results.value)
    .filter(([, result]) => result.qty > 0)
    .map(([key, result]) => {
      const [sectionIndex, itemIndex] = key.split('-').map(Number);
      const section = boss.sections[sectionIndex];
      const item = section.items[itemIndex];
      return {
        key,
        sectionIndex,
        itemIndex,
        name: item.name,
        qty: result.qty,
        noIcon: Boolean(item.noIcon),
        isUnique: Boolean(item.unique) || isUniqueSection(section.name),
      };
    })
    .filter((drop) => !drop.noIcon)
    .sort((a, b) => a.sectionIndex - b.sectionIndex || a.itemIndex - b.itemIndex);
});
</script>

<template>
  <div class="player-row">
    <p v-if="status !== 'ready' || !selectedBoss" class="chart-empty">{{ status === 'error' ? error : 'Loading boss loot data…' }}</p>
    <template v-else>
      <section class="lb quest-list-card">
        <div v-for="group in groupedBosses" :key="group.category" class="loot-boss-group">
          <div class="lb-head"><div class="lb-title"><h2>{{ group.label }}</h2></div></div>
          <ul class="quest-list loot-boss-list">
            <li v-for="boss in group.entries" :key="boss.slug" :class="`quest-list-item${boss.slug === selectedBoss.slug ? ' is-selected' : ''}`">
              <button type="button" class="quest-list-name loot-boss-name" @click="selectBoss(boss)">
                <img :src="bossIconFor(boss.slug)" alt="" class="loot-boss-thumb" width="20" height="20" decoding="async" />
                {{ boss.name }}
              </button>
            </li>
          </ul>
        </div>
      </section>

      <section class="lb loot-detail">
        <div class="loot-boss-header">
          <img
            :src="bossIconFor(selectedBoss.slug)"
            :alt="selectedBoss.name"
            class="loot-boss-portrait"
            :style="selectedBoss.portraitScale ? { width: `${120 * selectedBoss.portraitScale}px` } : undefined"
            decoding="async"
          />
          <div class="loot-boss-info">
            <div class="lb-title">
              <h2>{{ selectedBoss.name }}</h2>
              <a
                class="goal-card-wiki-link"
                :href="selectedBoss.wikiUrl"
                target="_blank"
                rel="noopener noreferrer"
                :aria-label="`Open ${selectedBoss.name} on the wiki`"
                title="Open on the wiki"
              >
                <img :src="WIKI_ICON" alt="" width="10" height="10" decoding="async" />
              </a>
            </div>
            <p class="loot-boss-meta">Combat level {{ selectedBoss.combatLevel }} · {{ selectedBoss.location }}</p>
          </div>
        </div>

        <div class="loot-body">
          <div class="loot-tables">
            <div v-for="section in selectedBoss.sections" :key="section.name" class="loot-section">
              <h3 class="loot-section-title">{{ section.name }}</h3>
              <table class="loot-table">
                <thead>
                  <tr>
                    <th class="loot-col-icon"></th>
                    <th class="loot-col-name">Item</th>
                    <th class="loot-col-qty">Quantity</th>
                    <th class="loot-col-rarity">Rarity</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(item, itemIndex) in section.items" :key="`${item.name}-${itemIndex}`" class="loot-row" :title="item.note ?? undefined">
                    <td class="loot-cell-icon">
                      <img v-if="!item.noIcon" :src="itemIconFor(item.name)" alt="" width="18" height="18" decoding="async" loading="lazy" @error="($event.target as HTMLImageElement).style.visibility = 'hidden'" />
                    </td>
                    <td class="loot-cell-name">
                      <a v-if="item.wikiUrl" :href="item.wikiUrl" target="_blank" rel="noopener noreferrer">{{ item.name }}</a>
                      <template v-else>{{ item.name }}</template>
                    </td>
                    <td class="loot-cell-qty">{{ item.quantity }}</td>
                    <td class="loot-cell-rarity">{{ item.rarity }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="loot-sim-panel">
            <div class="lb-head"><div class="lb-title"><h2>Loot simulator</h2></div></div>
            <div class="loot-sim-controls">
              <span class="loot-sim-presets">
                <button
                  v-for="preset in KILL_PRESETS"
                  :key="preset"
                  type="button"
                  class="loot-sim-preset"
                  :class="{ 'is-active': killCount === preset }"
                  @click="killCount = preset"
                >
                  {{ preset }}
                </button>
              </span>
              <span class="loot-sim-kills-row">
                <input
                  type="number"
                  min="1"
                  max="1000000"
                  step="1"
                  class="loot-sim-kills"
                  :value="killCount"
                  @input="killCount = Number(($event.target as HTMLInputElement).value)"
                />
                <span>kills</span>
              </span>
              <button type="button" class="loot-sim-roll" @click="roll">Roll</button>
              <p v-if="results" class="loot-sim-meta">Last roll: {{ rolledKills.toLocaleString() }} kills</p>
            </div>

            <p v-if="!results" class="loot-sim-empty">Press Roll to simulate loot from that many kills.</p>
            <p v-else-if="simulatedDrops.length === 0" class="loot-sim-empty">Nothing dropped this roll.</p>
            <div v-else class="loot-sim-results">
              <span v-for="drop in simulatedDrops" :key="drop.key" class="loot-sim-drop" :class="{ 'is-unique': drop.isUnique }">
                <img :src="itemIconFor(drop.name)" :alt="drop.name" :title="drop.name" width="22" height="22" decoding="async" loading="lazy" />
                <span class="loot-sim-drop-qty">{{ drop.qty.toLocaleString() }}</span>
              </span>
            </div>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
