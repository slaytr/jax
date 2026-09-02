import { ref } from 'vue';

/**
 * TEMP — local-only goals, Discord auth disabled.
 *
 * Discord auth isn't set up to test against locally right now, so this
 * bypasses the server-backed goals API (@shared/goals-storage.js +
 * @shared/goal-labels-storage.js, both untouched and still real) and goes
 * straight to localStorage instead — the exact same jax:goals:<slug> /
 * jax:goal-labels:<slug> keys the pre-auth version of this site used
 * (see git history before commit ab688b4). Every visitor can read and
 * write here; there's no ownership concept at all, matching that same
 * pre-auth behaviour (see GoalsTab.vue's canEdit).
 *
 * To restore the real server-backed version: swap this file's storage
 * calls back to loadGoalsAndLabels/createGoals/updateGoal/deleteGoal
 * (goals-storage.js) and putGoalLabel/deleteGoalLabel
 * (goal-labels-storage.js) — see the git history above for the last
 * working version of this file — and reinstate the ownership gate in
 * GoalsTab.vue and PlayerView.vue's handleGoalSkillSelect.
 */

const goalsKey = (slug: string) => `jax:goals:${slug}`;
const labelsKey = (slug: string) => `jax:goal-labels:${slug}`;

function readList(key: string): any[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeList(key: string, list: any[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // Storage blocked or full — nothing to do, the page still works.
  }
}

export function useGoals(slug: string) {
  const goals = ref<any[]>(readList(goalsKey(slug)));
  const labels = ref<any[]>(readList(labelsKey(slug)));
  const loading = ref(false);
  const error = ref<string | null>(null);

  function reload() {
    goals.value = readList(goalsKey(slug));
    labels.value = readList(labelsKey(slug));
  }

  function create(drafts: any[]) {
    goals.value = [...goals.value, ...drafts];
    writeList(goalsKey(slug), goals.value);
  }

  function remove(id: string) {
    goals.value = goals.value.filter((goal) => goal.id !== id);
    writeList(goalsKey(slug), goals.value);
  }

  /** Persists whatever refreshGoals (goal-status.js) just recomputed
   * against live data — a completion or a dropped goal alike, all in one
   * write, same as the pre-auth stats.js's own `if (changed) saveGoals(...)`. */
  function syncCompletion(_previousGoals: any[], nextGoals: any[]) {
    writeList(goalsKey(slug), nextGoals);
  }

  function putLabel(name: string, colour: string) {
    labels.value = [...labels.value.filter((label) => label.name !== name), { name, colour }];
    writeList(labelsKey(slug), labels.value);
  }

  function removeLabel(name: string) {
    labels.value = labels.value.filter((label) => label.name !== name);
    writeList(labelsKey(slug), labels.value);
  }

  return { goals, labels, loading, error, reload, create, remove, syncCompletion, putLabel, removeLabel };
}
