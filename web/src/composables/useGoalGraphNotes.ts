import { reactive, ref } from 'vue';

import { loadPrefs, savePrefs } from '@shared/prefs.js';
import { LABEL_COLOURS } from '@/lib/goals';

export interface GoalGraphNote {
  id: string;
  text: string;
  colour: string;
  /** Stacking relative to goal nodes and edges — see GoalsGraph.vue's own
   * noteNodes computed for how this becomes a real Vue Flow zIndex.
   * 'front' (the default) is also what a note gets with no zIndex set at
   * all, since that's already how the *first* note this feature ever
   * shipped with behaved — nodes and edges never set one either, so
   * everything ties at the implicit 0 and paints in array order, notes
   * last. */
  layer: 'front' | 'back';
  /** Textarea font size, in px — DEFAULT_FONT_SIZE (below) for a note saved
   * before this field existed, or before it became a plain number (see
   * readNotes' own migration) — unless a viewer's picked otherwise via
   * GoalGraphNote.vue's own numeric font-size input. Per-note, not a
   * viewer-wide preference like defaultColour: unlike a note's starting
   * colour, there's no single "default" reading size a viewer would want
   * every future note to start at regardless of how much text ends up in
   * it. */
  fontSize?: number;
  position: { x: number; y: number };
  size: { width: number; height: number };
}

/**
 * Free-floating sticky notes on the goal graph canvas (GoalsGraph.vue) —
 * same TEMP localStorage-only shape as useGoalGraphPositions.ts/
 * useGoalGraphConnections.ts, one array per player. Reuses goals.ts's own
 * LABEL_COLOURS palette for the colour picker (GoalGraphNote.vue) rather
 * than inventing a second one — the ask this was built for was explicitly
 * "similar colour options like we have when setting goals".
 *
 * `defaultColour` is the one piece of this that isn't per-player — a
 * viewer's own reading/authoring preference, so it lives in prefs.js's
 * shared `jax:prefs` blob (same file goalsView, the Gains grid/line
 * choice, etc. already use) instead of alongside the notes themselves.
 * Blue (LABEL_COLOURS[3]) until a viewer picks something else via
 * GoalGraphNote.vue's own "pin" button, which calls setDefaultColour with
 * whatever that note's current colour is.
 */
const key = (slug: string) => `jax:goal-graph-notes:${slug}`;

const DEFAULT_NOTE_SIZE = { width: 220, height: 160 };
const FALLBACK_NOTE_COLOUR = LABEL_COLOURS[3];
export const DEFAULT_FONT_SIZE = 13;

/** A note saved back when fontSize was still 'sm'/'md'/'lg' (rather than a
 * plain px number) keeps working — its old value maps onto its nearest
 * numeric equivalent the first time it's read, rather than silently
 * resetting to the default. */
const LEGACY_FONT_SIZE_PX: Record<string, number> = { sm: 11, md: DEFAULT_FONT_SIZE, lg: 15 };

function normalizeFontSize(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value in LEGACY_FONT_SIZE_PX) return LEGACY_FONT_SIZE_PX[value];
  return DEFAULT_FONT_SIZE;
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `note-${Date.now()}-${Math.random().toString(36).slice(2)}`);

function readNotes(slug: string): GoalGraphNote[] {
  try {
    const raw = localStorage.getItem(key(slug));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    // A note saved before the layer/fontSize fields existed still needs
    // them, same "old data just falls back to the field's own default"
    // reasoning every other addition to this app's persisted shapes
    // already uses.
    return parsed.map((note) => ({ layer: 'front', ...note, fontSize: normalizeFontSize(note.fontSize) }));
  } catch {
    return [];
  }
}

function writeNotes(slug: string, notes: GoalGraphNote[]) {
  try {
    localStorage.setItem(key(slug), JSON.stringify(notes));
  } catch {
    // Storage blocked or full — the note still exists for the rest of this
    // visit, it just won't survive a reload.
  }
}

export function useGoalGraphNotes(slug: string) {
  const notes = reactive<GoalGraphNote[]>(readNotes(slug));

  const storedDefault = loadPrefs().noteDefaultColour;
  const defaultColour = ref(typeof storedDefault === 'string' ? storedDefault : FALLBACK_NOTE_COLOUR);

  function setDefaultColour(colour: string) {
    defaultColour.value = colour;
    savePrefs({ ...loadPrefs(), noteDefaultColour: colour });
  }

  /** `position` is wherever GoalsGraph.vue decided to drop this one — see
   * its own note-button handler for why that's the current viewport centre
   * rather than a fixed graph coordinate. */
  function add(position: { x: number; y: number }): string {
    const note: GoalGraphNote = {
      id: uid(),
      text: '',
      colour: defaultColour.value,
      layer: 'front',
      fontSize: DEFAULT_FONT_SIZE,
      position,
      size: { ...DEFAULT_NOTE_SIZE },
    };
    notes.push(note);
    writeNotes(slug, notes);
    return note.id;
  }

  function update(id: string, patch: Partial<Pick<GoalGraphNote, 'text' | 'colour' | 'layer' | 'position' | 'size' | 'fontSize'>>) {
    const note = notes.find((candidate) => candidate.id === id);
    if (!note) return;
    Object.assign(note, patch);
    writeNotes(slug, notes);
  }

  function remove(id: string) {
    const index = notes.findIndex((candidate) => candidate.id === id);
    if (index === -1) return;
    notes.splice(index, 1);
    writeNotes(slug, notes);
  }

  return { notes, add, update, remove, defaultColour, setDefaultColour };
}
