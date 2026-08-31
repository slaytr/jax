import { el } from '../dom.js';
import { formatNumber, formatCompact, formatSpan, formatRelativeTime } from '../format.js';
import { xpForLevel } from '../xp-table.js';
import { SKILLS, iconFor } from '../config.js';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

const COMPLETED_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * A goal is complete once the player's *live* skill value (data.js's
 * skillById) reaches its target — checked against level or xp depending on
 * how it was set. This only runs when someone actually loads the page, not
 * continuously in the background (there's no server here to watch for it),
 * so `completedAt` really means "first noticed complete on a visit", not
 * the exact in-game moment — close enough for a personal tracker, but worth
 * knowing if a duration ever looks a little longer than expected.
 */
function checkCompletion(goal, player) {
  if (goal.completedAt) return goal;
  const value = player.skillById?.[goal.skillId];
  if (!value) return goal;

  const reached = goal.targetType === 'level' ? value.level >= goal.targetValue : value.xp >= goal.targetValue;
  if (!reached) return goal;

  return { ...goal, completedAt: new Date().toISOString(), completedLevel: value.level, completedXp: value.xp };
}

/**
 * Re-checks every goal against the player's current skills. Returns a new
 * array (goals that didn't change are the same object, so a caller can
 * still tell *which* changed if it ever needs to) plus whether anything
 * actually flipped to complete — stats.js only needs to persist when it did.
 */
export function refreshGoals(goals, player) {
  let changed = false;
  const next = goals.map((goal) => {
    const updated = checkCompletion(goal, player);
    if (updated !== goal) changed = true;
    return updated;
  });
  return { goals: next, changed };
}

const startValueOf = (goal) => (goal.targetType === 'level' ? goal.startLevel : goal.startXp);

function progressFraction(goal, currentValue) {
  const span = goal.targetValue - startValueOf(goal);
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (currentValue - startValueOf(goal)) / span));
}

const goalTargetLabel = (goal) => (goal.targetType === 'level' ? `Level ${formatNumber(goal.targetValue)}` : `${formatNumber(goal.targetValue)} xp`);

function deleteButton(goal, onDelete) {
  return el('button', {
    type: 'button',
    class: 'goal-card-delete',
    'aria-label': 'Delete this goal',
    onclick: () => onDelete(goal.id),
    text: '×',
  });
}

function activeGoalCard(goal, skill, player, onDelete) {
  const value = player.skillById?.[goal.skillId];
  const currentValue = goal.targetType === 'level' ? (value?.level ?? goal.startLevel) : (value?.xp ?? goal.startXp);
  const fraction = progressFraction(goal, currentValue);
  const progressText =
    goal.targetType === 'level'
      ? `${formatNumber(value?.level ?? goal.startLevel)} / ${formatNumber(goal.targetValue)}`
      : `${formatNumber(value?.xp ?? goal.startXp)} / ${formatNumber(goal.targetValue)} xp`;

  return el('li', { class: 'goal-card' }, [
    el('div', { class: 'goal-card-head' }, [
      el('img', { class: 'goal-card-icon', src: iconFor(skill), alt: '', width: 18, height: 18, decoding: 'async' }),
      el('span', { class: 'goal-card-name', text: skill.name }),
      el('span', { class: 'goal-card-target', text: goalTargetLabel(goal) }),
      deleteButton(goal, onDelete),
    ]),
    el('div', { class: 'goal-progress-track', role: 'presentation' }, [
      el('span', { class: 'goal-progress-fill', style: { width: `${(fraction * 100).toFixed(1)}%` } }),
    ]),
    metaLine([progressText, `Started ${formatRelativeTime(goal.startedAt)}`]),
  ]);
}

/**
 * `ratePerDay` floors its elapsed time at one hour — a goal completed
 * within minutes of being set (two visits close together, or a big xp
 * lamp/reward landing right after) would otherwise divide by a near-zero
 * span and report an absurd rate rather than just a fast one.
 */
/** Intersperses a " · " separator between meta-line segments, so the card
 * builders below just list what they want shown rather than each hand-
 * writing the joins. */
function metaLine(parts) {
  return el(
    'p',
    { class: 'goal-card-meta' },
    parts.flatMap((text, index) => [
      index > 0 ? el('span', { 'aria-hidden': 'true', text: ' · ' }) : null,
      el('span', { text }),
    ]),
  );
}

function completedGoalCard(goal, skill, onDelete) {
  const startedMs = Date.parse(goal.startedAt);
  const completedMs = Date.parse(goal.completedAt);
  const levelsGained = (goal.completedLevel ?? goal.startLevel) - goal.startLevel;
  const xpGained = (goal.completedXp ?? goal.startXp) - goal.startXp;
  const days = Math.max((completedMs - startedMs) / 86400000, 1 / 24);
  const ratePerDay = xpGained / days;

  return el('li', { class: 'goal-card is-complete' }, [
    el('div', { class: 'goal-card-head' }, [
      el('img', { class: 'goal-card-icon', src: iconFor(skill), alt: '', width: 18, height: 18, decoding: 'async' }),
      el('span', { class: 'goal-card-name', text: skill.name }),
      el('span', { class: 'goal-card-target', text: `✓ ${goalTargetLabel(goal)}` }),
      deleteButton(goal, onDelete),
    ]),
    metaLine([
      `Completed ${COMPLETED_DATE.format(new Date(completedMs))}`,
      `+${formatNumber(levelsGained)} level${levelsGained === 1 ? '' : 's'}`,
      `+${formatNumber(xpGained)} xp`,
      `Took ${formatSpan(completedMs - startedMs)}`,
      `${formatCompact(ratePerDay)} xp/day avg`,
    ]),
  ]);
}

/**
 * The Goals tab's second column — every goal this browser has set for
 * `player`, active ones first (creation order), completed ones shuffled to
 * the bottom (most recently finished first) rather than mixed in, so the
 * still-in-progress goals a viewer actually cares about stay at the top.
 *
 * `goals` is already up to date (stats.js runs refreshGoals before every
 * render) — this module only renders, it never decides completion itself.
 */
export function renderGoalsList(player, goals, onDeleteGoal) {
  const bySkillId = new Map(SKILLS.map((skill) => [skill.id, skill]));
  const active = goals.filter((goal) => !goal.completedAt);
  const completed = goals.filter((goal) => goal.completedAt).sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt));

  const body =
    active.length === 0 && completed.length === 0
      ? el('p', { class: 'chart-empty', text: 'No goals yet — click a skill to set one.' })
      : el('ul', { class: 'goals-list' }, [
          ...active.map((goal) => activeGoalCard(goal, bySkillId.get(goal.skillId), player, onDeleteGoal)),
          ...completed.map((goal) => completedGoalCard(goal, bySkillId.get(goal.skillId), onDeleteGoal)),
        ]);

  return el('section', { class: 'lb', style: { '--accent': player.colour } }, [
    el('div', { class: 'lb-head' }, [el('div', { class: 'lb-title' }, [el('h2', { text: 'Goals' })])]),
    body,
  ]);
}

/**
 * The "set a goal" dialog a skill-grid click opens (stats.js wires the
 * grid's onSelect to this). A real `<dialog>` — native focus trap, Escape
 * to dismiss, and a backdrop for free, none of which this codebase has had
 * to build before now.
 *
 * `onCreate(goalDraft)` fires once, on a valid submit, before the dialog
 * closes itself; `onClose()` fires from the dialog's own native `close`
 * event, which covers Cancel, Escape, *and* the close a successful submit
 * triggers — one place for stats.js to clear its "which dialog is open"
 * state and re-render, regardless of how the dialog actually closed.
 *
 * A maxed skill (already at its level cap) starts on the XP radio with the
 * Level one disabled — there's no next level left to set a goal against.
 */
export function renderGoalDialog(skill, player, { onCreate, onClose }) {
  const value = player.skillById?.[skill.id] ?? { level: 1, xp: 0 };
  const maxed = value.level >= skill.max;
  const nextLevel = Math.min(value.level + 1, skill.max);
  const nextLevelXp = xpForLevel(skill, nextLevel);

  const levelInput = el('input', {
    type: 'number',
    min: value.level + 1,
    max: skill.max,
    step: 1,
    value: maxed ? skill.max : nextLevel,
  });
  const xpInput = el('input', {
    type: 'number',
    min: value.xp + 1,
    step: 1,
    value: nextLevelXp ?? value.xp + 100000,
  });

  const levelRadio = el('input', {
    type: 'radio',
    name: 'goal-target-type',
    checked: maxed ? undefined : true,
    disabled: maxed ? true : undefined,
  });
  const xpRadio = el('input', { type: 'radio', name: 'goal-target-type', checked: maxed ? true : undefined });

  const syncEnabled = () => {
    levelInput.disabled = !levelRadio.checked;
    xpInput.disabled = !xpRadio.checked;
  };
  levelRadio.addEventListener('change', syncEnabled);
  xpRadio.addEventListener('change', syncEnabled);
  syncEnabled();

  const errorText = el('p', { class: 'goal-dialog-error', hidden: true });

  const form = el('form', { class: 'goal-form' }, [
    el('h3', { class: 'goal-dialog-title', text: `New ${skill.name} goal` }),
    el('p', { class: 'goal-dialog-current', text: `Currently level ${formatNumber(value.level)} (${formatNumber(value.xp)} xp)` }),
    el('label', { class: 'goal-target-choice' }, [levelRadio, el('span', { text: 'Level' }), levelInput]),
    el('label', { class: 'goal-target-choice' }, [xpRadio, el('span', { text: 'XP' }), xpInput]),
    errorText,
    el('div', { class: 'goal-dialog-actions' }, [
      el('button', { type: 'button', class: 'goal-btn', text: 'Cancel', onclick: () => dialog.close() }),
      el('button', { type: 'submit', class: 'goal-btn goal-btn-primary', text: 'Add goal' }),
    ]),
  ]);

  const dialog = el('dialog', { class: 'goal-dialog' }, [form]);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const useXp = xpRadio.checked;
    const raw = Number(useXp ? xpInput.value : levelInput.value);
    const min = useXp ? value.xp + 1 : value.level + 1;

    if (!Number.isFinite(raw) || raw < min) {
      errorText.textContent = useXp
        ? `Enter an xp target above ${formatNumber(value.xp)}.`
        : `Enter a level above ${formatNumber(value.level)}.`;
      errorText.hidden = false;
      return;
    }

    onCreate({
      id: uid(),
      skillId: skill.id,
      targetType: useXp ? 'xp' : 'level',
      targetValue: Math.trunc(raw),
      startLevel: value.level,
      startXp: value.xp,
      startedAt: new Date().toISOString(),
      completedAt: null,
      completedLevel: null,
      completedXp: null,
    });
    dialog.close();
  });

  dialog.addEventListener('close', onClose);

  return dialog;
}
