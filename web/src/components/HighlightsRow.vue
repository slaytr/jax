<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { buildMatrix, buildTotalsRow, computeDailyBreakdown, leaderCounts, maxedSkillCounts } from '@shared/compute.js';
import { el } from '@shared/dom.js';
import { formatCompact, formatNumber, formatRelativeTime, formatWeekday } from '@shared/format.js';
import { QUEST_POINTS_ICON, SKILLS, iconFor } from '@shared/config.js';
import type { AllGains } from '@/lib/gains';
import { tooltipContent, vTooltip } from '@/lib/tooltipDirective';
import { usePrefs } from '@/composables/usePrefs';
import HighlightChangeDialog, { type HighlightChange } from '@/components/HighlightChangeDialog.vue';
import HighlightMedalIcon from '@/components/HighlightMedalIcon.vue';
import OdometerValue from '@/components/OdometerValue.vue';
import changelogEntries from '@shared/changelog.json';

const props = defineProps<{ gains: AllGains; snapshots: any[]; players: any[] }>();

/** RuneMetrics' level-up `details` reads like "I levelled my Mining skill, I
 * am now level 76." — pull the skill name and new level back out so the feed
 * can show the skill's icon instead of the raw sentence. `text` alone
 * ("Levelled up Mining.") has no level number, so `details` is required. */
const LEVEL_UP_PATTERN = /^i levelled my (.+?) skill, i am now level (\d+)\.?$/i;

function levelUpFrom(activity: { details?: string | null }) {
  const match = activity.details ? LEVEL_UP_PATTERN.exec(activity.details.trim()) : null;
  if (!match) return null;
  const skill = SKILLS.find((candidate) => candidate.name.toLowerCase() === match[1].toLowerCase());
  if (!skill) return null;
  return { skill, level: Number(match[2]) };
}

/** RuneMetrics' own quest-completion text reads "Quest complete: Lost
 * City." — pulls just the quest name back out so the feed can show the
 * quest points icon + a green tick instead of the raw "Quest complete:"
 * prefix. Matched against `text`, not `details` (unlike levelUpFrom
 * above) — a completed quest's own `details` is null in practice. */
const QUEST_COMPLETE_PATTERN = /^quest complete:\s*(.+?)\.?$/i;

function questCompleteFrom(activity: { text?: string | null }) {
  const match = activity.text ? QUEST_COMPLETE_PATTERN.exec(activity.text.trim()) : null;
  return match ? match[1] : null;
}

/** One row per player with a recorded activity, most recent first —
 * captured by the update cycle (cron and REFRESH NOW alike; see
 * scripts/activity.mjs) onto each player's own `latestActivity`, so this
 * is just a sort, not a fetch of its own. A player who's never had a
 * successful RuneMetrics read yet (or has their profile hidden) simply
 * has no row here. */
const activityFeed = computed(() =>
  props.players
    .filter((player) => player.latestActivity?.date)
    .map((player) => ({
      player,
      activity: player.latestActivity,
      levelUp: levelUpFrom(player.latestActivity),
      questComplete: questCompleteFrom(player.latestActivity),
    }))
    .sort((a, b) => Date.parse(b.activity.date) - Date.parse(a.activity.date)),
);

/** How many skill rows (plus the Total row) each player leads the group
 * in — the exact same figure, same ★ + count treatment, as each player's
 * own column header on the Skill Leaderboard (SkillMatrix.vue's `leads`) —
 * shown here too so a name in the feed carries that same context without
 * having to go check the table below. */
const leads = computed(() => leaderCounts([...buildMatrix(props.players, 'level'), buildTotalsRow(props.players)]));

/** Skills each player has maxed at level 99 — same green star as the Skill
 * Leaderboard's own column header (SkillMatrix.vue's .player-maxed), shown
 * here too so a name in the feed carries that same context. */
const maxed = computed(() => maxedSkillCounts(props.players));

function activityTooltip(entry: (typeof activityFeed.value)[number]) {
  return () =>
    tooltipContent(
      entry.player.name,
      [
        ['Activity', entry.activity.details ?? entry.activity.text],
        ['When', formatRelativeTime(entry.activity.date)],
      ],
      entry.player.colour,
    );
}

/**
 * Three superlative badges — whoever ended the *rolling week* with the
 * single biggest total, regardless of whatever period the Gains section
 * itself is showing. All three are picked independently — the same player
 * can hold any or all of the crowns, since each badge measures a different
 * kind of effort and there's no reason a single player's week can't lead
 * on more than one axis. Ported from the old app.js's own
 * computeHighlights/topWeeklyGainer.
 */
const BADGES = [
  { key: 'level' as const, label: 'Ranker', formatValue: formatNumber, unit: '' },
  { key: 'xp' as const, label: 'Grind King', formatValue: formatCompact, unit: ' xp' },
  { key: 'quests' as const, label: 'Quest God', formatValue: formatNumber, unit: ' qp' },
];

function topWeeklyGainer(rows: any[], valueKey: string) {
  const top = rows.find((row) => row[valueKey] > 0);
  return top ? { player: top.player, value: top[valueKey] } : null;
}

const highlights = computed(() => {
  const level = topWeeklyGainer(props.gains.levels.week.rows, 'total');
  const xp = topWeeklyGainer(props.gains.xp.week.rows, 'total');
  const quests = topWeeklyGainer(props.gains.quests.week.rows, 'gained');

  const winners: Record<string, { player: any; value: number } | null> = { level, xp, quests };

  return BADGES.map((badge) => {
    const winner = winners[badge.key];
    return {
      ...badge,
      winner,
      breakdown: winner ? computeDailyBreakdown(props.snapshots, winner.player.slug, badge.key, 7) : [],
    };
  });
});

/**
 * Notices a crown changing hands since this browser last looked — compared
 * against weeklyHighlightWinners (prefs.js), a slug per badge recorded every
 * time this computed re-settles, not just on a page load, so an SSE-driven
 * refresh mid-visit triggers the same dialog a fresh visit would. Only a
 * real player-to-player handover pops the dialog: a badge that had no
 * recorded winner yet (first time this pref key exists at all, or nobody
 * had gains last time) just seeds silently — there's no outgoing leader to
 * animate away from, so nothing to show.
 */
const { prefs, savePref } = usePrefs();
const highlightChanges = ref<HighlightChange[]>([]);

watch(
  highlights,
  (list) => {
    const stored = (prefs.weeklyHighlightWinners as Record<string, string | null> | undefined) ?? {};
    const next: Record<string, string | null> = { ...stored };
    const changes: HighlightChange[] = [];

    for (const entry of list) {
      const hadStoredValue = Object.prototype.hasOwnProperty.call(stored, entry.key);
      const previousSlug = stored[entry.key] ?? null;
      const winnerSlug = entry.winner?.player.slug ?? null;

      if (hadStoredValue && previousSlug && winnerSlug && previousSlug !== winnerSlug) {
        const previousPlayer = props.players.find((player) => player.slug === previousSlug);
        changes.push({
          key: entry.key,
          label: entry.label,
          previous: previousPlayer
            ? { name: previousPlayer.name, colour: previousPlayer.colour }
            : { name: 'the previous leader', colour: 'var(--ink-muted)' },
          next: { name: entry.winner!.player.name, colour: entry.winner!.player.colour, value: entry.winner!.value, formatValue: entry.formatValue, unit: entry.unit },
        });
      }

      if (winnerSlug !== previousSlug) next[entry.key] = winnerSlug;
    }

    savePref({ weeklyHighlightWinners: next });
    if (changes.length > 0) highlightChanges.value = changes;
  },
  { immediate: true },
);

/** The hover tooltip's extra section: that day's gain for each of the last
 * 7 UTC calendar days, oldest first — a raw DOM node (not a Vue template)
 * since the tooltip directive's content is built outside Vue's own render. */
function dailyBreakdownExtra(breakdown: Array<{ dayStart: number; gained: number | null }>, formatValue: (n: number) => string) {
  if (!breakdown.length) return null;
  return el('div', { class: 'tooltip-daily' }, [
    el('p', { class: 'tooltip-daily-label', text: 'Daily breakdown' }),
    el(
      'dl',
      { class: 'tooltip-rows' },
      breakdown.flatMap((day) => [
        el('dt', { text: formatWeekday(day.dayStart) }),
        el('dd', { text: day.gained === null ? '—' : `+${formatValue(day.gained)}` }),
      ]),
    ),
  ]);
}

/** changelog.json's own `date` — a real ISO instant (the moment the
 * /changelog command ran, see .claude/commands/changelog.md), formatted in
 * NZT rather than the visitor's own local time or UTC: this changelog is
 * one person's own log of their own work, so its timestamps should always
 * read the same regardless of who/where it's viewed from — not
 * formatRelativeTime, a changelog entry is dated, not aged. Intl's own
 * Pacific/Auckland zone handles the NZST/NZDT daylight-saving switch
 * itself, no manual offset. */
const NZ_DATETIME = new Intl.DateTimeFormat('en-NZ', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Pacific/Auckland',
});

function changelogDate(isoInstant: string): string {
  const parsed = Date.parse(isoInstant);
  return Number.isFinite(parsed) ? NZ_DATETIME.format(new Date(parsed)) : isoInstant;
}

function buildTooltip(entry: (typeof highlights.value)[number]) {
  return () => {
    if (!entry.winner) return null;
    return tooltipContent(
      entry.winner.player.name,
      [[`${entry.label} this week`, `+${entry.formatValue(entry.winner.value)}${entry.unit}`]],
      entry.winner.player.colour,
      dailyBreakdownExtra(entry.breakdown, entry.formatValue),
    );
  };
}
</script>

<template>
  <div class="highlights-split">
    <section class="lb highlights">
      <div class="lb-head">
        <h2>
          <svg class="lb-icon" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
            <polygon points="9,1 11,6.5 17,7 12.5,10.8 14,17 9,13.5 4,17 5.5,10.8 1,7 7,6.5" />
          </svg>
          <span>Weekly leaders</span>
        </h2>
      </div>

      <div class="highlights-row">
        <div
          v-for="entry in highlights"
          :key="entry.key"
          class="highlight-badge"
          :class="{ 'is-empty': !entry.winner }"
          :style="entry.winner ? { '--accent': entry.winner.player.colour } : {}"
          :tabindex="entry.winner ? 0 : undefined"
          v-tooltip="buildTooltip(entry)"
        >
          <div class="highlight-medal">
            <HighlightMedalIcon :badge-key="entry.key" />
          </div>
          <p class="highlight-label">{{ entry.label }}</p>
          <p v-if="entry.winner" class="highlight-answer">
            <span class="swatch" :style="{ '--swatch': entry.winner.player.colour }" aria-hidden="true" />
            <span class="highlight-name">{{ entry.winner.player.name }}</span>
          </p>
          <p v-else class="highlight-answer">
            <span class="highlight-name">No gains yet</span>
          </p>
          <p v-if="entry.winner" class="highlight-value">+<OdometerValue :value="entry.winner.value" :format="entry.formatValue" /></p>
        </div>
      </div>
    </section>

    <!-- RuneMetrics' own per-player activity feed (scripts/activity.mjs),
         one entry per player — captured by every update cycle, cron and
         REFRESH NOW alike, so this is always as fresh as the rest of the
         page. -->
    <section class="lb activity-feed">
      <div class="lb-head">
        <h2>
          <svg class="lb-icon" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
            <rect x="3" y="1" width="1.6" height="16" />
            <path d="M4.6,2 L15,2 L12,5.4 L15,8.8 L4.6,8.8 Z" />
          </svg>
          <span>Activity feed</span>
        </h2>
      </div>
      <ul v-if="activityFeed.length" class="activity-feed-list">
        <li v-for="entry in activityFeed" :key="entry.player.slug" tabindex="0" v-tooltip="activityTooltip(entry)">
          <span class="swatch" :style="{ '--swatch': entry.player.colour }" aria-hidden="true" />
          <span class="activity-feed-name-group">
            <span class="activity-feed-name">{{ entry.player.name }}</span>
            <span class="player-badges">
              <span class="player-leads" :class="{ 'has-leads': (leads[entry.player.slug] ?? 0) > 0 }">
                <span class="player-leads-star" aria-hidden="true">★</span>
                <span aria-hidden="true">{{ formatNumber(leads[entry.player.slug] ?? 0) }}</span>
                <span class="visually-hidden">Leads {{ formatNumber(leads[entry.player.slug] ?? 0) }} skill rows</span>
              </span>
              <span v-if="(maxed[entry.player.slug] ?? 0) > 0" class="player-maxed has-maxed">
                <span class="player-maxed-star" aria-hidden="true">★</span>
                <span aria-hidden="true">{{ formatNumber(maxed[entry.player.slug]) }}</span>
                <span class="visually-hidden">{{ formatNumber(maxed[entry.player.slug]) }} skills maxed at level 99</span>
              </span>
            </span>
          </span>
          <span v-if="entry.levelUp" class="activity-feed-text activity-feed-levelup">
            <img :src="iconFor(entry.levelUp.skill)" class="activity-feed-skill-icon" width="14" height="14" alt="" decoding="async" />
            {{ entry.levelUp.level }}
            <span class="skill-gain">+1</span>
          </span>
          <span v-else-if="entry.questComplete" class="activity-feed-questcomplete">
            <img :src="QUEST_POINTS_ICON" class="activity-feed-skill-icon" width="14" height="14" alt="" decoding="async" />
            <span class="activity-feed-questcomplete-name">{{ entry.questComplete }}</span>
            <span class="goal-group-check" aria-hidden="true">✓</span>
          </span>
          <span v-else class="activity-feed-text">{{ entry.activity.text }}</span>
          <span class="activity-feed-time">{{ formatRelativeTime(entry.activity.date) }}</span>
        </li>
      </ul>
      <div v-else class="activity-feed-empty">
        <p>No recent activity yet.</p>
      </div>
    </section>

    <!-- Hand-written, not derived from anything else on the page — see
         .claude/commands/changelog.md, which appends to changelog.json on
         request; this just renders whatever's there, newest entry first. -->
    <section class="lb changelog">
      <div class="lb-head">
        <h2>
          <svg class="lb-icon" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
            <rect x="1" y="3" width="16" height="2" />
            <rect x="1" y="8" width="16" height="2" />
            <rect x="1" y="13" width="10" height="2" />
          </svg>
          <span>Changelog</span>
        </h2>
      </div>
      <ul v-if="changelogEntries.length" class="changelog-list">
        <li v-for="(entry, i) in changelogEntries" :key="i">
          <span class="changelog-date">{{ changelogDate(entry.date) }}</span>
          <span class="changelog-text">{{ entry.text }}</span>
        </li>
      </ul>
      <div v-else class="activity-feed-empty">
        <p>Nothing here yet.</p>
      </div>
    </section>
  </div>

  <HighlightChangeDialog v-if="highlightChanges.length > 0" :changes="highlightChanges" @close="highlightChanges = []" />
</template>
