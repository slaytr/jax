<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue';
import { useVueFlow } from '@vue-flow/core';

import { LABEL_COLOURS } from '@/lib/goals';
import { DEFAULT_FONT_SIZE, type GoalGraphNote } from '@/composables/useGoalGraphNotes';

/**
 * One free-floating sticky note on the goal graph canvas (GoalsGraph.vue) —
 * a plain-text box a viewer can drag, resize, recolour, and delete, dropped
 * wherever the fixed note-icon toggle put it. Deliberately plain text, not
 * a rich editor: the one bit of "formatting" is a toolbar button that
 * inserts a "• " bullet at the caret, rather than real HTML lists — simpler
 * and more robust than making <textarea>'s plain-text model carry actual
 * markup.
 *
 * `data.onUpdate`/`data.onRemove` are useGoalGraphNotes.ts's own
 * `update`/`remove`, pre-bound to this note's id by GoalsGraph.vue when it
 * builds the `nodes` array — passed straight through rather than emitting
 * a custom event, since Vue Flow's own node-slot rendering has no built-in
 * way to route a per-node emit back up to the flow's owner.
 *
 * Dragging the note itself (repositioning it) is Vue Flow's own built-in
 * node drag, same as a goal node — nothing special here for that. Every
 * interactive element below (settings/font-size buttons+menus, delete,
 * bullet button, textarea, resize handle) carries Vue Flow's own
 * `nodrag`/`nowheel` classes so using them doesn't also start a node drag
 * or hijack the canvas's scroll-to-zoom.
 *
 * Colour and stacking order live behind a single cog-icon trigger rather
 * than always-visible controls in the header — a header cramped enough at
 * 220px-wide default to already need `overflow` handling once everything
 * joined it. That dropdown also carries the "set as default" pin: it sets
 * *this* note's current colour as the default new notes are created with
 * from now on (useGoalGraphNotes.ts's own defaultColour/setDefaultColour,
 * a viewer-wide preference, not per-note). The order toggle flips `layer`
 * between 'front' (the default — paints over both goal nodes and edges)
 * and 'back' (under both) — see GoalsGraph.vue's own noteNodes computed for
 * how that becomes a real Vue Flow zIndex. Font size gets its own trigger
 * next to it rather than a third section of the same dropdown, since
 * picking a size is a one-shot action (unlike colour/order, there's
 * nothing else to combine it with).
 *
 * Only one of the two dropdowns is open at a time (`openMenu`) — opening
 * one implicitly closes the other, same as a menubar would.
 */
const props = defineProps<{
  data: {
    note: GoalGraphNote;
    onUpdate: (patch: Partial<Pick<GoalGraphNote, 'text' | 'colour' | 'layer' | 'size' | 'fontSize'>>) => void;
    onRemove: () => void;
    onSetDefaultColour: (colour: string) => void;
  };
}>();

type MenuName = 'settings' | 'fontSize';
const openMenu = ref<MenuName | null>(null);
const settingsMenuRef = useTemplateRef<HTMLElement>('settingsMenu');
const fontSizeMenuRef = useTemplateRef<HTMLElement>('fontSizeMenu');

function toggleMenu(name: MenuName) {
  openMenu.value = openMenu.value === name ? null : name;
}

/** Closes on an outside click/tap — same "click away to dismiss" behaviour
 * a dropdown menu is expected to have anywhere else on the site. Only
 * attached while actually open, and torn down with the note itself, so an
 * idle note (the common case) costs nothing. */
function onOutsideClick(event: PointerEvent) {
  const target = event.target as Node;
  if (settingsMenuRef.value?.contains(target) || fontSizeMenuRef.value?.contains(target)) return;
  openMenu.value = null;
}
watch(openMenu, (open) => {
  if (open) document.addEventListener('pointerdown', onOutsideClick, true);
  else document.removeEventListener('pointerdown', onOutsideClick, true);
});
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutsideClick, true));

function pickColour(colour: string) {
  props.data.onUpdate({ colour });
  openMenu.value = null;
}

const MIN_FONT_SIZE = 10;
const MAX_FONT_SIZE = 24;
const textareaFontSize = computed(() => `${props.data.note.fontSize ?? DEFAULT_FONT_SIZE}px`);

function onFontSizeInput(event: Event) {
  const raw = Number((event.target as HTMLInputElement).value);
  if (!Number.isFinite(raw)) return;
  const clamped = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(raw)));
  props.data.onUpdate({ fontSize: clamped });
}

const { getViewport } = useVueFlow();

const MIN_WIDTH = 160;
const MIN_HEIGHT = 110;

// Live-updated while actually dragging the resize handle; only committed
// back via onUpdate (and so to localStorage) on pointerup, so a drag
// doesn't write on every pixel of movement — same reasoning
// useGoalGraphPositions.ts's own onNodeDragStop (not a live onNodeDrag)
// already applies to repositioning.
const liveSize = ref<{ width: number; height: number } | null>(null);
const size = computed(() => liveSize.value ?? props.data.note.size);

function onResizePointerDown(event: PointerEvent) {
  event.stopPropagation();
  const startX = event.clientX;
  const startY = event.clientY;
  const startWidth = props.data.note.size.width;
  const startHeight = props.data.note.size.height;
  const zoom = getViewport().zoom || 1;

  function onMove(moveEvent: PointerEvent) {
    const width = Math.max(MIN_WIDTH, startWidth + (moveEvent.clientX - startX) / zoom);
    const height = Math.max(MIN_HEIGHT, startHeight + (moveEvent.clientY - startY) / zoom);
    liveSize.value = { width, height };
  }
  function onUp() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    if (liveSize.value) props.data.onUpdate({ size: liveSize.value });
    liveSize.value = null;
  }
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

const textareaRef = useTemplateRef<HTMLTextAreaElement>('textarea');

function onTextInput(event: Event) {
  props.data.onUpdate({ text: (event.target as HTMLTextAreaElement).value });
}

/** Inserts "• " at the caret (on its own line, unless the caret's already
 * at the start of one) rather than always appending to the end — a bullet
 * makes sense wherever a viewer's currently typing, not just at the bottom
 * of whatever's already there. */
function insertBullet() {
  const el = textareaRef.value;
  if (!el) return;
  const { selectionStart: start, selectionEnd: end, value } = el;
  const needsNewline = start > 0 && value[start - 1] !== '\n';
  const insertion = `${needsNewline ? '\n' : ''}• `;
  props.data.onUpdate({ text: value.slice(0, start) + insertion + value.slice(end) });
  requestAnimationFrame(() => {
    el.focus();
    const caret = start + insertion.length;
    el.setSelectionRange(caret, caret);
  });
}
</script>

<template>
  <div
    class="goal-graph-note"
    :style="{ '--note-colour': data.note.colour, width: `${size.width}px`, height: `${size.height}px` }"
  >
    <div class="goal-graph-note-header">
      <div ref="settingsMenu" class="goal-graph-note-settings-menu nodrag">
        <button
          type="button"
          class="goal-graph-note-settings-trigger"
          :aria-expanded="openMenu === 'settings' ? 'true' : 'false'"
          title="Note colour and order"
          @click="toggleMenu('settings')"
        >
          <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
            <circle cx="9" cy="9" r="2.4" fill="currentColor" stroke="none" />
            <path d="M9 1.6v1.9M9 14.5v1.9M16.4 9h-1.9M3.5 9H1.6M14.2 3.8l-1.35 1.35M5.15 12.85 3.8 14.2M14.2 14.2l-1.35-1.35M5.15 5.15 3.8 3.8" />
          </svg>
        </button>
        <div v-if="openMenu === 'settings'" class="goal-graph-note-settings-dropdown">
          <div class="goal-graph-note-settings-section">
            <p class="goal-graph-note-settings-label">Colour</p>
            <div class="goal-graph-note-colours">
              <button
                v-for="colour in LABEL_COLOURS"
                :key="colour"
                type="button"
                class="goal-graph-note-swatch"
                :class="{ 'is-selected': colour === data.note.colour }"
                :style="{ '--swatch': colour }"
                :aria-label="`Use ${colour}`"
                @click="pickColour(colour)"
              />
            </div>
            <button type="button" class="goal-graph-note-pin" @click="data.onSetDefaultColour(data.note.colour)">
              <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
                <polygon points="9,1 11,6.5 17,7 12.5,10.8 14,17 9,13.5 4,17 5.5,10.8 1,7 7,6.5" />
              </svg>
              <span>Set as default</span>
            </button>
          </div>
          <div class="goal-graph-note-settings-section">
            <p class="goal-graph-note-settings-label">Order</p>
            <button
              type="button"
              class="goal-graph-note-order-btn"
              :class="{ 'is-back': data.note.layer === 'back' }"
              @click="data.onUpdate({ layer: data.note.layer === 'back' ? 'front' : 'back' })"
            >
              <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
                <rect x="3" y="3" width="9" height="9" rx="1.5" />
                <rect x="7" y="7" width="9" height="9" rx="1.5" />
              </svg>
              <span>{{ data.note.layer === 'back' ? 'Bring to front' : 'Send behind' }}</span>
            </button>
          </div>
        </div>
      </div>
      <div ref="fontSizeMenu" class="goal-graph-note-fontsize-menu nodrag">
        <button
          type="button"
          class="goal-graph-note-fontsize-trigger"
          :aria-expanded="openMenu === 'fontSize' ? 'true' : 'false'"
          title="Font size"
          @click="toggleMenu('fontSize')"
        >
          {{ data.note.fontSize ?? DEFAULT_FONT_SIZE }}
        </button>
        <div v-if="openMenu === 'fontSize'" class="goal-graph-note-fontsize-dropdown">
          <label class="goal-graph-note-fontsize-field">
            <span>Font size (px)</span>
            <input
              type="number"
              :min="MIN_FONT_SIZE"
              :max="MAX_FONT_SIZE"
              step="1"
              class="goal-graph-note-fontsize-input"
              :value="data.note.fontSize ?? DEFAULT_FONT_SIZE"
              @input="onFontSizeInput"
            />
          </label>
        </div>
      </div>
      <button type="button" class="goal-graph-note-bullet-btn nodrag" title="Insert a bullet point" @click="insertBullet">•≡</button>
      <button type="button" class="goal-graph-note-delete nodrag" aria-label="Delete this note" @click="data.onRemove()">×</button>
    </div>
    <textarea
      ref="textarea"
      class="goal-graph-note-textarea nodrag nowheel"
      placeholder="Type a note…"
      :style="{ fontSize: textareaFontSize }"
      :value="data.note.text"
      @input="onTextInput"
    />
    <div class="goal-graph-note-resize nodrag" @pointerdown="onResizePointerDown">
      <svg viewBox="0 0 10 10" aria-hidden="true" focusable="false">
        <path d="M9 1 1 9M9 5 5 9M9 9 9 9" />
      </svg>
    </div>
  </div>
</template>
