<script setup lang="ts">
import { computed, onMounted } from 'vue';

import { COMBAT_ICON, QUEST_POINTS_ICON, WIKI_ICON, iconFor } from '@shared/config.js';
import { skillLevelsByName } from '@shared/quest-status.js';
import { useAreaTasks } from '@/composables/useAreaTasks';
import { useAreaTaskCompletion } from '@/composables/useAreaTaskCompletion';
import { parseRequirement, requirementStatus, summarizeRequirementStatuses } from '@/lib/areaTasks';
import type { AreaTaskRequirement } from '@/lib/areaTasks';
import type { StatsPageState } from '@/composables/useStatsPageState';

/**
 * The Tasks tab — a manual completion tracker for every RS3 Area Tasks
 * achievement (area-tasks.js, loaded lazily via useAreaTasks.ts), region on
 * the left, that region's own tier tabs and a compact task table on the
 * right. "Manual" because the hiscores API this app is built on has no
 * notion of which individual Area Tasks a player has actually completed
 * (unlike quests, where RuneMetrics gives a real completedQuests list) —
 * clicking a row just flips that row's own self-reported mark
 * (useAreaTaskCompletion.ts, localStorage per player), it isn't a synced
 * fact about the account the way a quest's checkmark is.
 *
 * The table is deliberately compact: a skill requirement renders as just
 * that skill's icon + level, a quest one as a quest icon + name
 * (parseRequirement, lib/areaTasks.ts) rather than repeating the full text,
 * and there's no separate Notes column — a task's own longer notes (when
 * it has any beyond a restatement of its description) sit behind the
 * description cell's own title tooltip instead of taking up permanent row
 * height. Every requirement chip — a task row's own and the tier box's
 * (below) alike — is checked live against this player's real skill levels
 * (skillLevelsByName, quest-status.js — same source the Quests tab's own
 * skill-requirement check uses) and completedQuests, and lit up green
 * (met) or red (unmet) accordingly (withStatus, shared by both); a
 * requirement neither a skill nor a quest match can verify ("500 music",
 * "100 combat level") stays neutral, there's nothing to check it against.
 *
 * The tier-requirements box above the table splits into Skills/Quests/
 * Other rows (tierRequirementGroups) rather than one long mixed one, so a
 * skill icon+level chip doesn't sit next to a much wider quest-name one.
 * Its own summary badge (requirementStatus/summarizeRequirementStatuses,
 * lib/areaTasks.ts) reduces every one of *that tier's* requirements' own
 * met/unmet down to one of four reads for the whole tier (green all met,
 * yellow above 80%, orange some, red none) — a per-task row has no
 * equivalent summary, since this app doesn't gate a task row on its own
 * requirements the way it does a tier's "can I even start this".
 * Recommended items sit in a `<details>`, collapsed by default — reference
 * material for once a viewer's actually doing the tier, not something
 * worth taking up space on every visit.
 *
 * The reward box below it is deliberately separate from the requirements
 * one — a different concern (what you get vs what you need) rather than
 * two facts crammed into one card. It carries its own tier label (the
 * requirements box's tier tabs already say which tier is selected, but
 * this box can get separated from them by a tall task table) and, where
 * the reward is an equippable item, that item's own effect breakdown
 * (rewardProgressionForTier — area-tasks.js's own rewardProgression,
 * scraped once per region since every tier subpage on the wiki renders the
 * *same* full chain table regardless of which one's own reward it's
 * naming) split the same way the wiki's own reward table already is: when
 * worn, when operated (used from the inventory without wearing it), and at
 * all times (active whether it's worn, banked, or never claimed as more
 * than a drop). Daemonheim's reward isn't an equippable at all ("Passive
 * Dungeoneering benefits"), so it has no such breakdown — the box still
 * shows, just without that section.
 *
 * Both the reward box and that tier's own tab (isTierComplete) light up
 * green once every one of that tier's tasks is checked off — a tab lights
 * up for any tier in the region, not just whichever's currently selected,
 * so switching tiers to check progress isn't necessary just to see which
 * ones are already fully done.
 *
 * Region/tier selection is round-tripped through `?region=`/`?tier=`
 * (statsState.taskRegionSlug/taskTier — see useStatsPageState.ts's own
 * doc comment) rather than kept as local component state, same reasoning
 * as the Quests tab's questSlug/seriesName: a link to one specific tier
 * should actually reopen it. The search box is a plain persisted reading
 * preference instead (statsState.taskSearch), same as questSearch.
 */
const props = defineProps<{ player: any; statsState: StatsPageState }>();

const { regions, status, error, ensureLoaded } = useAreaTasks();
onMounted(ensureLoaded);

const { isCompleted, toggle } = useAreaTaskCompletion(props.player.slug);

const skillLevels = computed(() => skillLevelsByName(props.player));
const completedQuests = computed(() => new Set<string>(props.player.completedQuests ?? []));

const selectedRegion = computed(() => {
  if (!regions.value) return null;
  return regions.value.find((region) => region.slug === props.statsState.taskRegionSlug) ?? regions.value[0];
});

const selectedTier = computed(() => {
  const region = selectedRegion.value;
  if (!region) return null;
  return region.tiers.find((tier) => tier.slug === props.statsState.taskTier) ?? region.tiers[0];
});

/** A requirement (tier-level or per-task) plus its live status against this
 * player — shared so a per-task row's own Requirements column can light up
 * green/red exactly like the tier-requirements box above the table does,
 * rather than the two places drifting into two different readings of the
 * same player. */
function withStatus(requirements: AreaTaskRequirement[]) {
  return requirements.map((requirement) => {
    const parsed = parseRequirement(requirement);
    return { parsed, status: requirementStatus(parsed, skillLevels.value, completedQuests.value) };
  });
}

const tierRequirements = computed(() => (selectedTier.value ? withStatus(selectedTier.value.requirements) : []));

const tierRequirementsSummary = computed(() => summarizeRequirementStatuses(tierRequirements.value.map((row) => row.status)));

/** Skills/quests/other — same three-way split parseRequirement's own
 * `skill`/`quest`/`alternatives`/`combatLevel` fields already carry, just
 * grouped into separate rows instead of one long mixed one, so a skill
 * icon+level chip doesn't sit next to a much wider quest-name chip. An
 * either/or skill requirement (`alternatives`) or a combat-level one
 * (`combatLevel`) counts as a skill for grouping purposes — they're skill
 * icons, not a quest or a leftover fragment. "Other" is whatever's neither
 * (an alternative-requirements fragment with its own unparsed caveat text,
 * "500 music tracks unlocked") — see lib/areaTasks.ts's own doc comment. */
const tierRequirementGroups = computed(() => {
  const groups: { skills: typeof tierRequirements.value; quests: typeof tierRequirements.value; other: typeof tierRequirements.value } = {
    skills: [],
    quests: [],
    other: [],
  };
  for (const row of tierRequirements.value) {
    if (row.parsed.skill || row.parsed.alternatives || row.parsed.combatLevel !== null) groups.skills.push(row);
    else if (row.parsed.quest) groups.quests.push(row);
    else groups.other.push(row);
  }
  return groups;
});

/** The reward-item chain entry (area-tasks.js's own rewardProgression, e.g.
 * "Morytania legs 3") lined up against whichever tier is currently
 * selected — by array position, not tier name: every region's
 * rewardProgression was scraped in the same fixed tier order its own
 * tiers list is in (Easy/Medium/Hard/Elite, or Beginner/Easy/Medium/Hard
 * for Lumbridge), so the two arrays' indices already correspond 1:1.
 * `null` for a region with no item-chain reward at all (Daemonheim's is
 * "Passive Dungeoneering benefits", not an equippable) — rewardProgression
 * is `[]` there, not missing, same shape either way. */
const rewardProgressionForTier = computed(() => {
  const region = selectedRegion.value;
  const tier = selectedTier.value;
  if (!region || !tier || region.rewardProgression.length === 0) return null;
  const index = region.tiers.findIndex((candidate) => candidate.slug === tier.slug);
  return region.rewardProgression[index] ?? null;
});

function selectRegion(region: NonNullable<typeof selectedRegion.value>) {
  props.statsState.taskRegionSlug = region.slug;
  props.statsState.taskTier = null; // falls back to that region's first tier
}

function selectTier(tier: NonNullable<typeof selectedTier.value>) {
  props.statsState.taskTier = tier.slug;
}

/** The region list's own B/E/M/H/X letters (below) double as a direct
 * shortcut to one region+tier combination — same two fields selectRegion/
 * selectTier each set individually, just both at once so a click jumps
 * straight to that tier instead of landing on the region's first one. */
function selectRegionTier(region: NonNullable<typeof selectedRegion.value>, tier: NonNullable<typeof selectedTier.value>) {
  props.statsState.taskRegionSlug = region.slug;
  props.statsState.taskTier = tier.slug;
}

/** Whether every task in a tier is checked off (useAreaTaskCompletion.ts) —
 * read directly off the reactive completion set in the template (a tier
 * tab needs this for every tier in the region, not just whichever's
 * selected, so a viewer can see which ones are already done without
 * clicking through each). False for a tier with no tasks at all, same
 * "nothing to vacuously call done" reasoning as an empty checklist. */
function isTierComplete(tier: { tasks: { slug: string }[] }) {
  return tier.tasks.length > 0 && tier.tasks.every((task) => isCompleted(task.slug));
}

/** One-letter tier abbreviations for the region list's own B/E/M/H/X
 * shortcut row (below each region name, one button per tier that region
 * actually has) — X for Elite since E is already Easy's. Falls back to a
 * tier's own first letter for anything unexpected rather than rendering
 * nothing, though every tier this app actually has is one of these five. */
const TIER_LETTERS: Record<string, string> = { Beginner: 'B', Easy: 'E', Medium: 'M', Hard: 'H', Elite: 'X' };
function tierLetter(tierName: string) {
  return TIER_LETTERS[tierName] ?? tierName.charAt(0).toUpperCase();
}

const filteredTasks = computed(() => {
  if (!selectedTier.value) return [];
  const term = props.statsState.taskSearch.trim().toLowerCase();
  const tasks = selectedTier.value.tasks;
  if (!term) return tasks;
  return tasks.filter((task) => task.name.toLowerCase().includes(term) || task.description.toLowerCase().includes(term));
});
</script>

<template>
  <div class="player-row">
    <p v-if="status !== 'ready' || !selectedRegion || !selectedTier" class="chart-empty">{{ status === 'error' ? error : 'Loading Area Tasks…' }}</p>
    <template v-else>
    <section class="lb quest-list-card">
      <div class="lb-head"><div class="lb-title"><h2>Regions</h2></div></div>
      <ul class="quest-list task-region-list">
        <li v-for="region in regions" :key="region.slug" :class="`quest-list-item${region.slug === selectedRegion.slug ? ' is-selected' : ''}`">
          <button type="button" class="quest-list-name" :title="region.region" @click="selectRegion(region)">{{ region.region }}</button>
          <span class="task-region-tiers">
            <button
              v-for="tier in region.tiers"
              :key="tier.slug"
              type="button"
              class="task-region-tier-letter"
              :class="{
                'is-complete': isTierComplete(tier),
                'is-active': region.slug === selectedRegion.slug && tier.slug === selectedTier.slug,
              }"
              :title="`Jump to ${tier.tier} ${region.region}${isTierComplete(tier) ? ' — every task checked off' : ''}`"
              @click="selectRegionTier(region, tier)"
            >
              {{ tierLetter(tier.tier) }}
            </button>
          </span>
        </li>
      </ul>
    </section>

    <section class="lb">
      <div class="lb-head">
        <div class="lb-title">
          <h2>{{ selectedRegion.region }}</h2>
          <a
            class="goal-card-wiki-link"
            :href="selectedRegion.wikiUrl"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="`Open ${selectedRegion.region} achievements on the wiki`"
            title="Open on the wiki"
          >
            <img :src="WIKI_ICON" alt="" width="10" height="10" decoding="async" />
          </a>
        </div>
        <label class="quest-filter">
          <span class="visually-hidden">Search {{ selectedRegion.region }} tasks</span>
          <input
            type="search"
            class="quest-search-input"
            placeholder="Search tasks…"
            :value="statsState.taskSearch"
            @input="statsState.taskSearch = ($event.target as HTMLInputElement).value"
          />
        </label>
      </div>

      <p class="task-region-summary">{{ selectedRegion.areas }} · Final reward: {{ selectedRegion.finalReward }}</p>

      <nav class="task-tier-tabs" aria-label="Difficulty tier">
        <button
          v-for="tier in selectedRegion.tiers"
          :key="tier.slug"
          type="button"
          class="task-tier-tab"
          :class="{ 'is-active': tier.slug === selectedTier.slug, 'is-complete': isTierComplete(tier) }"
          :title="isTierComplete(tier) ? `Every ${tier.tier} task is checked off` : undefined"
          @click="selectTier(tier)"
        >
          {{ tier.tier }} <span class="task-tier-tab-count">{{ tier.tasks.length }}</span>
        </button>
      </nav>

      <div class="task-tier-info">
        <div class="task-tier-requirements-head">
          <strong>Requirements</strong>
          <span class="task-req-status" :class="`is-${tierRequirementsSummary.level}`">{{ tierRequirementsSummary.label }}</span>
        </div>
        <div v-if="tierRequirementGroups.skills.length" class="task-req-group">
          <span class="task-req-group-label">Skills</span>
          <span class="task-req-group-chips">
            <span
              v-for="row in tierRequirementGroups.skills"
              :key="row.parsed.text"
              class="task-req-chip"
              :class="{ 'is-met': row.status === 'met', 'is-unmet': row.status === 'unmet' }"
              :title="row.parsed.text"
            >
              <template v-if="row.parsed.skill">
                <img :src="iconFor(row.parsed.skill)" alt="" width="14" height="14" decoding="async" />
                {{ row.parsed.level }}<template v-if="row.parsed.boostable"> (b)</template>
              </template>
              <template v-else-if="row.parsed.alternatives">
                <template v-for="(alternative, index) in row.parsed.alternatives" :key="alternative.skill.id">
                  <span v-if="index > 0" class="task-req-chip-divider">/</span>
                  <img :src="iconFor(alternative.skill)" alt="" width="14" height="14" decoding="async" />
                  {{ alternative.level }}<template v-if="alternative.boostable"> (b)</template>
                </template>
              </template>
              <template v-else-if="row.parsed.combatLevel !== null">
                <img :src="COMBAT_ICON" alt="" width="14" height="14" decoding="async" />
                {{ row.parsed.combatLevel }}
              </template>
            </span>
          </span>
        </div>
        <div v-if="tierRequirementGroups.quests.length" class="task-req-group">
          <span class="task-req-group-label">Quests</span>
          <span class="task-req-group-chips">
            <span
              v-for="row in tierRequirementGroups.quests"
              :key="row.parsed.text"
              class="task-req-chip task-req-chip-text"
              :class="{ 'is-met': row.status === 'met', 'is-unmet': row.status === 'unmet' }"
              :title="row.parsed.text"
            >
              <img :src="QUEST_POINTS_ICON" alt="" width="14" height="14" decoding="async" />
              {{ row.parsed.text }}
            </span>
          </span>
        </div>
        <div v-if="tierRequirementGroups.other.length" class="task-req-group">
          <span class="task-req-group-label">Other</span>
          <span class="task-req-group-chips">
            <span v-for="row in tierRequirementGroups.other" :key="row.parsed.text" class="task-req-chip task-req-chip-text" :title="row.parsed.text">
              {{ row.parsed.text }}
            </span>
          </span>
        </div>

        <details v-if="selectedTier.recommendedItems.length" class="task-tier-items">
          <summary>Recommended items ({{ selectedTier.recommendedItems.length }})</summary>
          <ul>
            <li v-for="item in selectedTier.recommendedItems" :key="item">{{ item }}</li>
          </ul>
        </details>
      </div>

      <div v-if="selectedTier.rewardNpc || rewardProgressionForTier" class="task-reward-box" :class="{ 'is-complete': isTierComplete(selectedTier) }">
        <div class="task-reward-head">
          <strong>Reward</strong>
          <span class="task-tier-badge">{{ selectedTier.tier }}</span>
        </div>
        <p class="task-reward-summary">
          <a
            v-if="rewardProgressionForTier"
            class="goal-card-wiki-link"
            :href="rewardProgressionForTier.wikiUrl"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="`Open ${rewardProgressionForTier.item} on the wiki`"
            title="Open on the wiki"
          >
            <img :src="WIKI_ICON" alt="" width="10" height="10" decoding="async" />
          </a>
          {{ selectedTier.rewardItem }}<span v-if="selectedTier.lampXp"
            >&nbsp;+ {{ selectedTier.lampXp.toLocaleString() }} XP lamp<span v-if="selectedTier.lampLevel"> (level {{ selectedTier.lampLevel }}+)</span></span
          ><span v-if="selectedTier.rewardNpc">&nbsp;from {{ selectedTier.rewardNpc }}<span v-if="selectedTier.rewardNpcLocation"> ({{ selectedTier.rewardNpcLocation }})</span></span>
        </p>
        <div v-if="rewardProgressionForTier" class="task-reward-effects">
          <div v-if="rewardProgressionForTier.whenWorn.length" class="task-reward-effect-group">
            <p class="task-reward-effect-label">When worn</p>
            <ul>
              <li v-for="effect in rewardProgressionForTier.whenWorn" :key="effect">{{ effect }}</li>
            </ul>
          </div>
          <div v-if="rewardProgressionForTier.whenOperated.length" class="task-reward-effect-group">
            <p class="task-reward-effect-label">When operated</p>
            <ul>
              <li v-for="effect in rewardProgressionForTier.whenOperated" :key="effect">{{ effect }}</li>
            </ul>
          </div>
          <div v-if="rewardProgressionForTier.atAllTimes.length" class="task-reward-effect-group">
            <p class="task-reward-effect-label">At all times (no need to wear it)</p>
            <ul>
              <li v-for="effect in rewardProgressionForTier.atAllTimes" :key="effect">{{ effect }}</li>
            </ul>
          </div>
        </div>
      </div>

      <p v-if="filteredTasks.length === 0" class="chart-empty task-list-empty">No tasks match this search.</p>
      <table v-else class="task-table">
        <thead>
          <tr>
            <th class="task-col-name">Name</th>
            <th class="task-col-task">Task</th>
            <th class="task-col-reqs">Requirements</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="task in filteredTasks"
            :key="task.slug"
            class="task-row"
            :class="{ 'is-complete': isCompleted(task.slug) }"
            :title="isCompleted(task.slug) ? 'Mark as not done' : 'Mark as done'"
            @click="toggle(task.slug)"
          >
            <td class="task-cell-name">
              <a class="task-name-link" :href="task.wikiUrl" target="_blank" rel="noopener noreferrer" title="Open on the wiki" @click.stop>{{ task.name }}</a>
            </td>
            <td class="task-cell-task" :title="task.notes || undefined">{{ task.description }}</td>
            <td class="task-cell-reqs">
              <div class="task-cell-reqs-inner">
                <span v-if="task.requirements.length === 0" class="task-req-none">—</span>
                <template v-for="row in withStatus(task.requirements)" v-else :key="row.parsed.text">
                  <span
                    v-if="row.parsed.skill || row.parsed.alternatives || row.parsed.combatLevel !== null"
                    class="task-req-chip"
                    :class="{ 'is-met': row.status === 'met', 'is-unmet': row.status === 'unmet' }"
                    :title="row.parsed.text"
                  >
                    <template v-if="row.parsed.skill">
                      <img :src="iconFor(row.parsed.skill)" alt="" width="14" height="14" decoding="async" />
                      {{ row.parsed.level }}<template v-if="row.parsed.boostable"> (b)</template>
                    </template>
                    <template v-else-if="row.parsed.alternatives">
                      <template v-for="(alternative, index) in row.parsed.alternatives" :key="alternative.skill.id">
                        <span v-if="index > 0" class="task-req-chip-divider">/</span>
                        <img :src="iconFor(alternative.skill)" alt="" width="14" height="14" decoding="async" />
                        {{ alternative.level }}<template v-if="alternative.boostable"> (b)</template>
                      </template>
                    </template>
                    <template v-else-if="row.parsed.combatLevel !== null">
                      <img :src="COMBAT_ICON" alt="" width="14" height="14" decoding="async" />
                      {{ row.parsed.combatLevel }}
                    </template>
                  </span>
                  <span
                    v-else-if="row.parsed.quest"
                    class="task-req-chip task-req-chip-text"
                    :class="{ 'is-met': row.status === 'met', 'is-unmet': row.status === 'unmet' }"
                    :title="row.parsed.text"
                  >
                    <img :src="QUEST_POINTS_ICON" alt="" width="14" height="14" decoding="async" />
                    {{ row.parsed.text }}
                  </span>
                  <span v-else class="task-req-chip task-req-chip-text" :title="row.parsed.text">{{ row.parsed.text }}</span>
                </template>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
    </template>
  </div>
</template>
